import os
import json
from typing import Dict, Any

class ComplianceAuditor:
    def __init__(self):
        self.ai_enabled = False
        self.provider = None
        
        if os.environ.get("GOOGLE_API_KEY"):
            try:
                import google.generativeai as genai
                genai.configure(api_key=os.environ.get("GOOGLE_API_KEY"))
                self.model = genai.GenerativeModel('gemini-1.5-pro')
                self.provider = "gemini-sdk"
                self.ai_enabled = True
                print("ComplianceAuditor: Initialized using google-generativeai SDK")
            except Exception as e:
                print(f"ComplianceAuditor: Failed to initialize google-generativeai: {e}")
                
        if not self.ai_enabled:
            try:
                import vertexai
                from vertexai.generative_models import GenerativeModel
                project = os.environ.get("GOOGLE_CLOUD_PROJECT", "decisiontwin-hackathon")
                location = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")
                vertexai.init(project=project, location=location)
                self.model = GenerativeModel("gemini-1.5-pro-preview-0409")
                self.provider = "vertexai"
                self.ai_enabled = True
                print("ComplianceAuditor: Initialized using Vertex AI SDK")
            except Exception as e:
                print(f"ComplianceAuditor: Vertex AI not initialized, using mock fallback: {e}")

    def generate_audit_report(self, simulation_results: Dict[str, Any], domain: str, protected_attribute: str) -> str:
        """
        Ingests the simulation results, including demographics parity curves and Gemma's critique,
        and generates a compliance audit formatted against Indian regulatory guidelines.
        """
        yearly_results = simulation_results.get("yearly_results", [])
        gemma_critique = simulation_results.get("gemma_critique", "")
        
        # Prepare summaries of final bias metrics
        final_metrics = {}
        if yearly_results:
            final_metrics = yearly_results[-1].get("metrics", {})
            
        metrics_summary = {
            "total_years_simulated": len(yearly_results),
            "final_demographic_parity_ratio": final_metrics.get("demographic_parity_ratio"),
            "final_demographic_parity_diff": final_metrics.get("demographic_parity_diff"),
            "final_disparate_impact": final_metrics.get("disparate_impact"),
        }

        prompt = f"""
        You are 'Agent 3: Compliance Auditor', an AI compliance agent verifying predictive models against critical regulatory guidelines.
        
        Domain Pack: {domain.upper()}
        Protected Attribute Evaluated: {protected_attribute}
        
        Simulation Metrics:
        {json.dumps(metrics_summary, indent=2)}
        
        Simulation Critic's (Gemma 2) Assessment:
        "{gemma_critique}"
        
        Please generate a comprehensive Compliance Audit Report. Your report must evaluate the model's fairness and long-term bias risks against the following regulatory frameworks:
        
        1. **RBI Digital Lending Guidelines** (specifically around algorithmic transparency, non-discriminatory lending practices, and credit decisioning ethics).
        2. **NITI Aayog Responsible AI Guidelines** (focusing on the principles of fairness, equality, non-discrimination, and reliability/safety of AI deployments).
        3. **DPDP Act 2023 (Digital Personal Data Protection Act, India)** (focusing on data minimization, purpose limitation, and protected personal attributes processing consent/fairness).
        
        Your report must follow this exact structure:
        # EXECUTIVE COMPLIANCE AUDIT
        [A high-level business summary of the risk findings]
        
        ## REGULATORY ALIGNMENT
        - **RBI Digital Lending:** [Compliance score / analysis]
        - **NITI Aayog Responsible AI:** [Compliance score / analysis]
        - **DPDP Act 2023:** [Compliance score / analysis]
        
        ## DETECTED RISK VULNERABILITIES
        [Specific feedback on how bias compiles or drifts over the virtual years, referencing the Critic's notes]
        
        ## REMEDIATION ROADMAP
        [Actionable steps for mitigation, e.g. post-processing bias mitigation, HITL override thresholds, model retraining]
        
        Ensure the tone is professional, legal-adjacent, and highly detailed.
        """

        if not self.ai_enabled:
            return self._generate_mock_report(domain, protected_attribute, metrics_summary, gemma_critique)

        try:
            if self.provider == "gemini-sdk":
                response = self.model.generate_content(prompt)
                return response.text.strip()
            else:
                from vertexai.generative_models import GenerationConfig
                response = self.model.generate_content(
                    prompt,
                    generation_config=GenerationConfig(temperature=0.4)
                )
                return response.text.strip()
        except Exception as e:
            print(f"ComplianceAuditor API call failed, falling back to mock: {e}")
            return self._generate_mock_report(domain, protected_attribute, metrics_summary, gemma_critique)

    def _generate_mock_report(self, domain: str, protected_attribute: str, metrics: Dict[str, Any], critique: str) -> str:
        dp_ratio = metrics.get("final_demographic_parity_ratio", 0.0)
        status = "NON-COMPLIANT (HIGH RISK)" if dp_ratio < 0.8 else "COMPLIANT WITH CONDITIONS"
        
        # Domain-specific regulatory context
        if domain.lower() == "hiring":
            reg_sections = {
                "primary": {
                    "name": "Equal Employment Opportunity (EEO) & Corporate D&I Compliance",
                    "status": "CRITICAL CONCERN" if dp_ratio < 0.8 else "NEUTRAL",
                    "detail": "The current hiring model indicates systematic bias against protected attributes in candidate selection, violating EEO principles of non-discriminatory employment practices and corporate Diversity & Inclusion (D&I) mandates."
                },
                "secondary": {
                    "name": "NITI Aayog Responsible AI",
                    "status": "FAILED" if dp_ratio < 0.8 else "PASSED WITH RESERVATIONS",
                    "detail": "The longitudinal simulation demonstrates that hiring bias compounds over time as rejected candidates accumulate experience gaps, creating a feedback loop that violates NITI Aayog's principles of 'Equality' and 'Fairness' in automated decision-making."
                },
                "tertiary": {
                    "name": "DPDP Act 2023 (Employment Data Processing)",
                    "status": "RISK OF COMPLIANCE VIOLATION" if dp_ratio < 0.8 else "ALIGNED",
                    "detail": "Processing sensitive personal data (gender, ethnicity) for automated hiring decisions without adequate fair-processing safeguards breaches the digital trust framework and risks talent pipeline homogeneity."
                },
                "feedback_loop": "rejecting candidates based on historic bias stalls their career progression (experience gap increases), causing a compounding talent pipeline loss and D&I penalty."
            }
        elif domain.lower() == "scholarship":
            reg_sections = {
                "primary": {
                    "name": "UN SDG 4 (Quality Education) & SDG 10 (Reduced Inequalities)",
                    "status": "CRITICAL CONCERN" if dp_ratio < 0.8 else "NEUTRAL",
                    "detail": "The current scholarship selection model indicates systematic bias against protected attributes, violating UN Sustainable Development Goal 4 (inclusive and equitable quality education) and SDG 10 (reduced inequalities in access and opportunity)."
                },
                "secondary": {
                    "name": "NITI Aayog Responsible AI",
                    "status": "FAILED" if dp_ratio < 0.8 else "PASSED WITH RESERVATIONS",
                    "detail": "The longitudinal simulation demonstrates that selection bias compounds over time as rejected students fall behind academically, creating a feedback loop that violates NITI Aayog's principles of 'Equality' and 'Fairness' in automated decision-making."
                },
                "tertiary": {
                    "name": "DPDP Act 2023 & Right to Education Act",
                    "status": "RISK OF COMPLIANCE VIOLATION" if dp_ratio < 0.8 else "ALIGNED",
                    "detail": "Using sensitive personal data (rural/urban status, family income) for automated scholarship decisions without adequate fair-processing safeguards breaches educational equity frameworks and the digital trust framework."
                },
                "feedback_loop": "rejecting students based on historic bias reduces their academic scores over time, causing a compounding educational access inequality."
            }
        else:  # lending (default)
            reg_sections = {
                "primary": {
                    "name": "RBI Digital Lending Guidelines",
                    "status": "CRITICAL CONCERN" if dp_ratio < 0.8 else "NEUTRAL",
                    "detail": "The current credit disbursement model indicates systematic bias against protected attributes, violating the RBI's core principles of non-discriminatory access to digital credit."
                },
                "secondary": {
                    "name": "NITI Aayog Responsible AI",
                    "status": "FAILED" if dp_ratio < 0.8 else "PASSED WITH RESERVATIONS",
                    "detail": "The longitudinal simulation demonstrates that bias compiles over time due to feedback loops, violating NITI Aayog's principles of 'Equality' and 'Fairness' in automated decision-making."
                },
                "tertiary": {
                    "name": "DPDP Act 2023 (Digital Personal Data Protection)",
                    "status": "RISK OF COMPLIANCE VIOLATION" if dp_ratio < 0.8 else "ALIGNED",
                    "detail": "Compounding discrimination based on sensitive personal data (such as gender or region) without adequate fair-processing safeguards breaches the digital trust framework."
                },
                "feedback_loop": "approving or rejecting applicants based on historic bias alters their underlying credit scores, causing a feedback loop that exacerbates systemic inequality."
            }
        
        return f"""# EXECUTIVE COMPLIANCE AUDIT

**Audit Status:** {status}
**Domain:** {domain.upper()}
**Target Attribute:** {protected_attribute}

This audit reviews the AI model's performance over {metrics.get('total_years_simulated', 5)} years. Based on the demographic parity ratio of {dp_ratio}, the model exhibits compounding bias that poses significant regulatory and compliance risks.

## REGULATORY ALIGNMENT

- **{reg_sections['primary']['name']}:** {reg_sections['primary']['status']}. {reg_sections['primary']['detail']}
- **{reg_sections['secondary']['name']}:** {reg_sections['secondary']['status']}. {reg_sections['secondary']['detail']}
- **{reg_sections['tertiary']['name']}:** {reg_sections['tertiary']['status']}. {reg_sections['tertiary']['detail']}

## DETECTED RISK VULNERABILITIES

The Simulation Critic (Gemma 2) flagged the following issues: "{critique}".
Our analysis indicates that {reg_sections['feedback_loop']}

## REMEDIATION ROADMAP

1. **Implement Human-In-The-Loop Overrides:** Enable immediate override controls for applicants scoring in the borderline 40-60% threshold range.
2. **Apply Post-Processing Fairness Constraints:** Introduce Fairlearn grid search or threshold-adjustments to equalize selection rates.
3. **Continuous Algorithmic Auditing:** Schedule quarterly fairness audits to identify data drift before the feedback loop compounds.
"""
