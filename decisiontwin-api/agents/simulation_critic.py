import os
import json
import requests
import joblib
import pandas as pd
import numpy as np
from typing import List, Dict, Any

class SimulationCritic:
    def __init__(self):
        self.ollama_url = os.environ.get("OLLAMA_URL", "http://localhost:11434/api/generate")
        self.use_vertex = os.environ.get("GEMMA_USE_VERTEX", "false").lower() == "true"
        self.vertex_initialized = False
        
        if self.use_vertex:
            try:
                import vertexai
                from vertexai.generative_models import GenerativeModel
                project = os.environ.get("GOOGLE_CLOUD_PROJECT", "decisiontwin-hackathon")
                location = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")
                vertexai.init(project=project, location=location)
                # Gemma 2 endpoint/model in Vertex Model Garden. Typically named:
                self.vertex_model = GenerativeModel("gemma2")
                self.vertex_initialized = True
                print("SimulationCritic: Initialized Vertex AI Gemma 2 connector")
            except Exception as e:
                print(f"SimulationCritic: Failed to initialize Vertex AI Gemma 2: {e}. Falling back to Ollama.")
                self.use_vertex = False

    def query_gemma2(self, prompt: str) -> str:
        """Queries Gemma 2 using Vertex AI or Ollama Local API."""
        if self.use_vertex and self.vertex_initialized:
            try:
                response = self.vertex_model.generate_content(prompt)
                return response.text.strip()
            except Exception as e:
                print(f"SimulationCritic: Vertex AI Gemma 2 call failed: {e}. Trying Ollama fallback.")

        try:
            payload = {
                "model": "gemma2:2b",
                "prompt": prompt,
                "stream": False
            }
            response = requests.post(self.ollama_url, json=payload, timeout=30)
            if response.status_code == 200:
                result = response.json()
                return result.get("response", "").strip()
            else:
                return f"Error: Ollama returned status {response.status_code}"
        except Exception as e:
            return f"Error connecting to Ollama Gemma 2: {e}. (Make sure Ollama is running and gemma2 is installed)"

    def _latest_fairness_snapshot(self, results: Dict[str, Any]) -> Dict[str, Any]:
        yearly_results = results.get("yearly_results", [])
        if not yearly_results:
            return {
                "latest_ratio": 1.0,
                "avg_ratio": 1.0,
                "drift": 0.0,
                "latest_approval_rate": 0.0,
            }

        latest = yearly_results[-1]
        metrics = latest.get("metrics", {})
        ratio = float(metrics.get("demographic_parity_ratio", 1.0))
        avg_ratio = sum(float(item.get("metrics", {}).get("demographic_parity_ratio", 1.0)) for item in yearly_results) / len(yearly_results)
        first_ratio = float(yearly_results[0].get("metrics", {}).get("demographic_parity_ratio", 1.0))

        return {
            "latest_ratio": ratio,
            "avg_ratio": avg_ratio,
            "drift": ratio - first_ratio,
            "latest_approval_rate": float(latest.get("average_target_rate", 0.0)),
        }

    def generate_adjustment_suggestion(self, results: Dict[str, Any], domain: str, protected_attribute: str) -> Dict[str, Any]:
        """Generate a mitigation suggestion using Gemma and a safe heuristic fallback."""
        snapshot = self._latest_fairness_snapshot(results)
        fairness_ratio = max(0.05, snapshot["latest_ratio"])
        expected_bias_reduction_pct = int(round(max(12, min(45, (1.0 - fairness_ratio) * 100 + max(0.0, -snapshot["drift"]) * 25))))

        feature = "income" if domain.lower() == "lending" else "education" if domain.lower() == "scholarship" else "experience"
        fallback = (
            f"Sir, agar aap '{feature.title()}' ko {expected_bias_reduction_pct}% zyada weightage denge, "
            f"toh bias {expected_bias_reduction_pct}% kam ho jayega aur business outcomes bhi safer rahenge. "
            f"Ye adjustment fairness ratio ko ~{min(0.99, fairness_ratio + 0.08):.2f} tak improve kar sakta hai."
        )

        prompt = (
            f"You are a fairness advisor for the {domain} domain. "
            f"The current fairness ratio is {fairness_ratio:.2f}, and the bias drift is {snapshot['drift']:.2f}. "
            f"Protected attribute: {protected_attribute}. "
            "Suggest one concrete mitigation action a business leader can implement, in simple Hindi/English, "
            "and explain why it should reduce bias while protecting business outcomes."
        )

        gemma_output = self.query_gemma2(prompt)
        suggestion_text = gemma_output if not gemma_output.startswith("Error") else fallback
        if not suggestion_text.strip():
            suggestion_text = fallback

        return {
            "suggestion": suggestion_text,
            "expected_bias_reduction_pct": expected_bias_reduction_pct,
            "recommended_feature": feature,
            "status": "gemma" if not gemma_output.startswith("Error") else "fallback",
        }

    def generate_compliance_scorecard(self, results: Dict[str, Any], domain: str, protected_attribute: str) -> Dict[str, Any]:
        """Create a simple legal-readiness scorecard for the current simulation run."""
        snapshot = self._latest_fairness_snapshot(results)
        fairness_ratio = max(0.0, min(1.0, snapshot["avg_ratio"]))
        disparate_impact = 1.0
        for item in results.get("yearly_results", []):
            disparate_impact = min(disparate_impact, float(item.get("metrics", {}).get("disparate_impact", 1.0)))

        fairness_score = int(round(fairness_ratio * 100))
        impact_penalty = max(0, int(round((1.0 - disparate_impact) * 20)))
        drift_penalty = max(0, int(round(max(0.0, -snapshot["drift"]) * 30)))
        score = int(round(max(0, min(100, 55 + fairness_score * 0.35 - impact_penalty - drift_penalty))))

        if score >= 85:
            status = "Legal-ready / Low risk"
        elif score >= 70:
            status = "Needs governance review"
        else:
            status = "High regulatory attention"

        reasons = [
            f"Average fairness ratio is {fairness_ratio:.2f} across the simulation horizon.",
            f"Disparate impact is {disparate_impact:.2f}; lower values indicate stronger bias exposure.",
        ]
        if snapshot["drift"] < -0.03:
            reasons.append("Bias drift is trending downward over time and should be mitigated before rollout.")
        else:
            reasons.append("Bias drift remains stable; monitor for future policy changes.")

        legal_prompt = (
            f"You are creating a concise compliance summary for a {domain} AI system. "
            f"Protected attribute: {protected_attribute}. "
            f"Current fairness ratio: {fairness_ratio:.2f}. "
            "Provide a one-sentence legal readiness note for leadership."
        )
        legal_note = self.query_gemma2(legal_prompt)
        if legal_note.startswith("Error") or not legal_note.strip():
            legal_note = f"With a fairness ratio of {fairness_ratio:.2f} and disparate impact of {disparate_impact:.2f}, this model requires governance review before enterprise deployment to align with fairness standards."

        return {
            "score": score,
            "status": status,
            "reasons": reasons,
            "legal_note": legal_note,
            "domain": domain,
            "protected_attribute": protected_attribute,
        }

    def load_model(self, model_path: str):
        """Loads a model (.pkl or .onnx)."""
        try:
            if model_path.endswith('.pkl'):
                return joblib.load(model_path)
            elif model_path.endswith('.onnx'):
                import onnxruntime as ort
                return ort.InferenceSession(model_path)
            else:
                raise ValueError(f"Unsupported model format: {model_path}")
        except Exception as e:
            print(f"Error loading model {model_path}: {e}")
            raise RuntimeError(f"Failed to load model safely: {e}")

    def predict(self, model, X: pd.DataFrame, target_outcome: str = "approved") -> np.ndarray:
        """Performs model inference, automatically handling pipeline, sklearn models, or ONNX sessions."""
        # Check if sklearn model
        if hasattr(model, "predict"):
            # Ensure categorical columns are cast to string to prevent numpy isnan errors
            X_copy = X.copy()
            try:
                preprocessor = None
                if hasattr(model, "named_steps") and "preprocessor" in model.named_steps:
                    preprocessor = model.named_steps["preprocessor"]
                elif hasattr(model, "steps") and len(model.steps) > 0:
                    preprocessor = model.steps[0][1]
                
                if preprocessor and hasattr(preprocessor, "transformers"):
                    for name, transformer, cols in preprocessor.transformers:
                        if name == 'cat' or 'cat' in name:
                            for col in cols:
                                if col in X_copy.columns:
                                    X_copy[col] = X_copy[col].astype(str)
            except Exception as e:
                print(f"Warning: failed to cast categorical columns to string: {e}")
            return model.predict(X_copy)
        else:
            # ONNX session
            import onnxruntime as ort
            # Get input name
            input_name = model.get_inputs()[0].name
            # Need to format X as float32 numpy array or appropriate schema
            # Assuming X is prepared for ONNX
            X_numpy = X.to_numpy().astype(np.float32)
            outputs = model.run(None, {input_name: X_numpy})
            # Standard output
            preds = outputs[0]
            # If shape is (N, 2) (probabilities), take argmax
            if len(preds.shape) == 2 and preds.shape[1] == 2:
                return np.argmax(preds, axis=1)
            return (preds > 0.5).astype(int)

    def apply_state_transitions(self, df: pd.DataFrame, decisions: np.ndarray, domain: str) -> pd.DataFrame:
        """
        Applies mathematical state transitions based on decisions:
        - Lending: approval -> credit score increase, rejection -> credit score decrease.
        - Scholarship: approval -> academic progress score increases, rejection -> drops.
        - Hiring: approval -> years of experience increases, rejection -> stagnates.
        """
        new_df = df.copy()
        # Pre-cast columns that may receive float values to float64 to avoid int64 assignment errors
        transition_cols = {
            "lending": ["credit_score"],
            "scholarship": ["academic_score"],
            "hiring": ["years_experience"]
        }
        for col in transition_cols.get(domain.lower(), []):
            if col in new_df.columns:
                new_df[col] = new_df[col].astype(float)
        
        for idx, decision in enumerate(decisions):
            if domain.lower() == "lending":
                if "credit_score" in new_df.columns:
                    current_score = new_df.at[idx, "credit_score"]
                    if decision == 1:
                        new_df.at[idx, "credit_score"] = min(850, current_score + 15)
                    else:
                        new_df.at[idx, "credit_score"] = max(300, current_score - 10)
            elif domain.lower() == "scholarship":
                if "academic_score" in new_df.columns:
                    current_score = new_df.at[idx, "academic_score"]
                    if decision == 1:
                        new_df.at[idx, "academic_score"] = min(100, current_score + 5)
                    else:
                        new_df.at[idx, "academic_score"] = max(0, current_score - 8)
            elif domain.lower() == "hiring":
                if "years_experience" in new_df.columns:
                    current_exp = new_df.at[idx, "years_experience"]
                    if decision == 1:
                        new_df.at[idx, "years_experience"] = current_exp + 1
                    else:
                        new_df.at[idx, "years_experience"] = current_exp + 0.1  # minimal freelance experience
        return new_df

    def calculate_fairness_metrics(self, df: pd.DataFrame, decisions: np.ndarray, protected_attribute: str) -> Dict[str, float]:
        """Calculates demographic parity ratio, difference, and disparate impact ratio."""
        if protected_attribute not in df.columns:
            return {"demographic_parity_ratio": 1.0, "demographic_parity_diff": 0.0, "disparate_impact": 1.0}
        
        # Fairlearn / sklearn metrics
        from fairlearn.metrics import demographic_parity_difference, demographic_parity_ratio
        
        y_pred = pd.Series(decisions)
        sensitive_features = df[protected_attribute]
        
        try:
            dp_ratio = demographic_parity_ratio(y_true=y_pred, y_pred=y_pred, sensitive_features=sensitive_features)
            dp_diff = demographic_parity_difference(y_true=y_pred, y_pred=y_pred, sensitive_features=sensitive_features)
        except Exception as e:
            print(f"Fairlearn computation failed: {e}")
            dp_ratio = 1.0
            dp_diff = 0.0
            
        # Calculate disparate impact manually if needed for robustness
        # DI = P(Y_hat=1 | sensitive=deprived) / P(Y_hat=1 | sensitive=privileged)
        try:
            groups = df[protected_attribute].unique()
            if len(groups) >= 2:
                rates = {}
                for g in groups:
                    mask = (df[protected_attribute] == g)
                    if mask.sum() > 0:
                        rates[g] = decisions[mask].mean()
                    else:
                        rates[g] = 0.0
                
                # Assume minority is the group with the lower approval rate
                sorted_rates = sorted(rates.items(), key=lambda x: x[1])
                deprived_rate = sorted_rates[0][1]
                privileged_rate = sorted_rates[-1][1] if sorted_rates[-1][1] > 0 else 1.0
                
                disparate_impact = deprived_rate / privileged_rate if privileged_rate > 0 else 1.0
            else:
                disparate_impact = 1.0
        except Exception as e:
            disparate_impact = 1.0
            
        return {
            "demographic_parity_ratio": round(float(dp_ratio), 4),
            "demographic_parity_diff": round(float(dp_diff), 4),
            "disparate_impact": round(float(disparate_impact), 4)
        }

    def simulate_longitudinal_loop(
        self,
        initial_df: pd.DataFrame,
        model_path: str,
        protected_attribute: str,
        target_outcome: str,
        domain: str,
        years: int = 5,
        hitl_overrides: Dict[int, Dict[str, int]] = None # Format: {year: {row_index: override_decision_0_or_1}}
    ) -> Dict[str, Any]:
        """
        Runs the multi-year longitudinal simulation.
        Applies decisions, HITL overrides, state transitions, and calculates bias metrics per year.
        """
        hitl_overrides = hitl_overrides or {}
        model = self.load_model(model_path)
        
        current_df = initial_df.copy()
        
        yearly_results = []
        
        for year in range(1, years + 1):
            X = current_df.drop(columns=[target_outcome], errors='ignore')
            
            # Cast categorical columns to string to prevent numpy isnan errors in scikit-learn
            try:
                preprocessor = None
                if hasattr(model, "named_steps") and "preprocessor" in model.named_steps:
                    preprocessor = model.named_steps["preprocessor"]
                elif hasattr(model, "steps") and len(model.steps) > 0:
                    preprocessor = model.steps[0][1]
                
                if preprocessor and hasattr(preprocessor, "transformers"):
                    for name, transformer, cols in preprocessor.transformers:
                        if name == 'cat' or 'cat' in name:
                            for col in cols:
                                if col in X.columns:
                                    X[col] = X[col].astype(str)
            except Exception as e:
                print(f"Warning: failed to cast categorical columns to string in simulation: {e}")
            
            # Predict
            raw_decisions = self.predict(model, X, target_outcome)
            
            # Apply HITL overrides for the current year if any
            final_decisions = raw_decisions.copy()
            year_overrides = hitl_overrides.get(year, {})
            for row_idx_str, override_val in year_overrides.items():
                row_idx = int(row_idx_str)
                if 0 <= row_idx < len(final_decisions):
                    final_decisions[row_idx] = override_val
            
            # Calculate fairness metrics
            metrics = self.calculate_fairness_metrics(current_df, final_decisions, protected_attribute)
            
            # Identify borderline applications for HITL panel (e.g. model was close to threshold)
            # Since we may not always have probabilities, let's flag people with attributes that typically trigger bias
            # Or identify instances where their features put them near the approval boundary
            borderline_indices = []
            if hasattr(model, "predict_proba"):
                probs = model.predict_proba(X)[:, 1]
                # Borderline cases are close to 0.5 (e.g. between 0.4 and 0.6)
                borderline_indices = [int(i) for i, p in enumerate(probs) if 0.35 <= p <= 0.65]
            else:
                # Fallback: pick some random indices or records with lower/mid credit/academic scores
                if domain.lower() == "lending" and "credit_score" in current_df.columns:
                    borderline_indices = current_df[
                        (current_df["credit_score"] >= 580) & (current_df["credit_score"] <= 660)
                    ].index.tolist()
                elif domain.lower() == "scholarship" and "academic_score" in current_df.columns:
                    borderline_indices = current_df[
                        (current_df["academic_score"] >= 70) & (current_df["academic_score"] <= 82)
                    ].index.tolist()
                elif domain.lower() == "hiring" and "technical_score" in current_df.columns:
                    borderline_indices = current_df[
                        (current_df["technical_score"] >= 65) & (current_df["technical_score"] <= 78)
                    ].index.tolist()
                else:
                    borderline_indices = list(range(min(10, len(current_df))))
            
            borderline_cases = []
            for idx in borderline_indices[:8]:  # Limit to top 8 borderline cases for UI display
                borderline_cases.append({
                    "row_index": idx,
                    "traits": current_df.iloc[idx].to_dict(),
                    "model_decision": int(raw_decisions[idx]),
                    "actual_decision": int(final_decisions[idx]),
                    "is_overridden": str(idx) in year_overrides
                })
            
            # Record state
            yearly_results.append({
                "year": year,
                "metrics": metrics,
                "data_snapshot": current_df.to_dict(orient="records"),
                "decisions": final_decisions.tolist(),
                "borderline_cases": borderline_cases,
                "average_target_rate": round(float(final_decisions.mean()), 4)
            })
            
            # Apply mathematical state transition for the NEXT year
            current_df = self.apply_state_transitions(current_df, final_decisions, domain)
            
        # Get Gemma 2 longitudinal critique
        summary_prompt = f"""
        You are 'Agent 2: Simulation Critic', a Gemma 2 agent evaluating longitudinal algorithmic bias over {years} simulated years.
        
        Domain: {domain.upper()}
        Protected Attribute: {protected_attribute}
        
        Yearly Fairness Metrics:
        """
        for r in yearly_results:
            summary_prompt += f"\nYear {r['year']}: Demographic Parity Ratio = {r['metrics']['demographic_parity_ratio']}, Disparate Impact = {r['metrics']['disparate_impact']}, Overall Selection Rate = {r['average_target_rate']}"
            
        summary_prompt += """
        
        Provide a 3-sentence critique flagging whether the bias is compounding over time (bias drift) and identify any systemic feedback loops.
        """
        
        critique = self.query_gemma2(summary_prompt)

        simulation_summary = {
            "yearly_results": yearly_results,
            "gemma_critique": critique,
        }

        return {
            "yearly_results": yearly_results,
            "gemma_critique": critique,
            "adjustment_suggestion": self.generate_adjustment_suggestion(simulation_summary, domain, protected_attribute),
            "compliance_scorecard": self.generate_compliance_scorecard(simulation_summary, domain, protected_attribute),
        }

    def run_doppelganger_audit(self, df: pd.DataFrame, model, protected_attribute: str, target_outcome: str) -> Dict[str, Any]:
        """Runs the Dynamic Doppelgänger Test (Counterfactual Audit)."""
        if protected_attribute not in df.columns:
            return {"flip_rate_percentage": 0.0, "flipped_cases_sample": []}

        X = df.drop(columns=[target_outcome], errors='ignore')

        # Safely cast categorical columns
        X_copy = X.copy()
        try:
            preprocessor = None
            if hasattr(model, "named_steps") and "preprocessor" in model.named_steps:
                preprocessor = model.named_steps["preprocessor"]
            elif hasattr(model, "steps") and len(model.steps) > 0:
                preprocessor = model.steps[0][1]
            
            if preprocessor and hasattr(preprocessor, "transformers"):
                for name, transformer, cols in preprocessor.transformers:
                    if name == 'cat' or 'cat' in name:
                        for col in cols:
                            if col in X_copy.columns:
                                X_copy[col] = X_copy[col].astype(str)
        except Exception as e:
            print(f"Warning: failed to cast categorical columns to string in doppelganger: {e}")

        # 1. Initial predictions
        initial_decisions = self.predict(model, X_copy, target_outcome)
        
        # 2. Find privileged class
        rates = {}
        for group in df[protected_attribute].unique():
            mask = (df[protected_attribute] == group)
            if mask.sum() > 0:
                rates[group] = initial_decisions[mask].mean()
        
        if not rates:
            return {"flip_rate_percentage": 0.0, "flipped_cases_sample": []}
            
        privileged_class = max(rates, key=rates.get)
        
        # 3. Find rejected rows
        rejected_indices = [i for i, d in enumerate(initial_decisions) if d == 0 and df.iloc[i][protected_attribute] != privileged_class]
        
        if not rejected_indices:
            return {"flip_rate_percentage": 0.0, "flipped_cases_sample": []}
            
        # 4 & 5. Create clones and overwrite protected_attribute
        clones_X = X_copy.iloc[rejected_indices].copy()
        clones_X[protected_attribute] = privileged_class
        # Ensure it's string if needed
        clones_X[protected_attribute] = clones_X[protected_attribute].astype(str)

        # 6. Run predictions on clones
        new_decisions = self.predict(model, clones_X, target_outcome)
        
        # 7. Count flipped
        flipped_count = int(new_decisions.sum())
        flip_rate_percentage = round((flipped_count / len(rejected_indices)) * 100, 2)
        
        # 8. Sample flipped cases
        flipped_cases_sample = []
        flipped_indices = [idx for i, idx in enumerate(rejected_indices) if new_decisions[i] == 1]
        
        for idx in flipped_indices[:5]:
            original_traits = df.iloc[idx].to_dict()
            flipped_traits = original_traits.copy()
            flipped_traits[protected_attribute] = privileged_class
            
            flipped_cases_sample.append({
                "original_traits": original_traits,
                "flipped_traits": flipped_traits
            })
            
        return {
            "flip_rate_percentage": flip_rate_percentage,
            "flipped_cases_sample": flipped_cases_sample,
            "privileged_class": privileged_class
        }

    def calculate_financial_impact(self, total_applicants: int, disparate_impact: float, domain: str) -> Dict[str, Any]:
        """Translates fairness metrics into tangible financial/business loss."""
        # Calculate disparity and unfairly rejected count
        disparity = max(0.0, 1.0 - disparate_impact)
        # Heuristic: Assume ~50% of the applicant pool belongs to the unprivileged group.
        unfairly_rejected_count = int(total_applicants * 0.5 * disparity)
        
        loss_amount = 0.0
        domain_lower = domain.lower()
        
        if domain_lower == "lending":
            # Assume avg loan = $50,000, profit margin = 5%
            loss_amount = unfairly_rejected_count * 50000 * 0.05
        elif domain_lower == "hiring":
            # Cost of bad hire / missing top talent
            loss_amount = unfairly_rejected_count * 15000
        elif domain_lower == "scholarship":
            # Misallocated funds / societal cost
            loss_amount = unfairly_rejected_count * 10000
            
        # Format currency (e.g. $1.5M or $50K)
        if loss_amount >= 1_000_000:
            currency_formatted = f"${loss_amount / 1_000_000:.1f}M"
        elif loss_amount >= 1_000:
            currency_formatted = f"${loss_amount / 1_000:.1f}K"
        else:
            currency_formatted = f"${loss_amount:.0f}"
            
        impact_statement = f"This model's bias is unfairly rejecting ~{unfairly_rejected_count} qualified applicants, resulting in a projected opportunity loss of {currency_formatted}."
        
        return {
            "unfairly_rejected_count": unfairly_rejected_count,
            "financial_loss_amount": loss_amount,
            "currency_formatted": currency_formatted,
            "impact_statement": impact_statement
        }

