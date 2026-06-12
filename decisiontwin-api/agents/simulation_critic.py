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
        
        return {
            "yearly_results": yearly_results,
            "gemma_critique": critique
        }
