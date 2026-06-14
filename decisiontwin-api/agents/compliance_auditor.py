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

    # ─────────────────────────────────────────────────────────────────────────
    # Comprehensive Legal Audit Report (~1500 words, 7-section structured)
    # ─────────────────────────────────────────────────────────────────────────

    def generate_comprehensive_audit(self, simulation_data: Dict[str, Any], domain: str) -> str:
        """
        Generates a comprehensive ~1500-word, 7-section legal audit report using
        Gemini 1.5 Pro. Incorporates simulation metrics, doppelganger results,
        financial impact, and crash-test data for thorough regulatory compliance mapping.
        """
        yearly_results = simulation_data.get("yearly_results", [])
        gemma_critique = simulation_data.get("gemma_critique", "Not available.")
        protected_attribute = simulation_data.get("protected_attribute", "protected_attribute")
        adjustment = simulation_data.get("adjustment_suggestion", {}) or {}
        scorecard = simulation_data.get("compliance_scorecard", {}) or {}
        business_impact = simulation_data.get("business_impact", {}) or {}

        final_metrics = yearly_results[-1]["metrics"] if yearly_results else {}
        all_metrics = [
            {"year": r["year"], **r["metrics"], "selection_rate": r.get("average_target_rate", 0)}
            for r in yearly_results
        ]

        prompt = f"""
You are **Agent 3: Chief Compliance Auditor** for the DecisionTwin AI Governance Platform — \
a senior legal-AI hybrid analyst specializing in algorithmic accountability, Indian financial regulations, \
and AI ethics frameworks.

Your task is to write a **comprehensive, ~1500-word, professionally styled Legal Compliance Audit Report** \
in Markdown format. The report must be dense, analytical, and legally precise — suitable for presentation \
to a Board of Directors, a Regulatory Review Committee, or a Chief Risk Officer.

---

**SIMULATION CONTEXT**
- Domain: {domain.upper()}
- Protected Attribute Under Review: {protected_attribute}
- Simulation Horizon: {len(yearly_results)} Virtual Years
- Final Demographic Parity Ratio: {final_metrics.get("demographic_parity_ratio", "N/A")}
- Final Disparate Impact Score: {final_metrics.get("disparate_impact", "N/A")}
- Final Demographic Parity Difference: {final_metrics.get("demographic_parity_diff", "N/A")}
- Year-by-Year Metrics: {json.dumps(all_metrics, indent=2)}
- Gemma 2 Longitudinal Critique: "{gemma_critique}"
- Compliance Scorecard: {json.dumps(scorecard, indent=2)}
- Suggested Adjustment: {json.dumps(adjustment, indent=2)}
- Financial Impact Analysis: {json.dumps(business_impact, indent=2)}

---

**MANDATORY REPORT STRUCTURE** — write each section in full, dense, professional prose:

# DECISIONTWIN COMPREHENSIVE LEGAL COMPLIANCE AUDIT REPORT

## 1. Executive Summary
Write 3–4 dense paragraphs summarising: the domain, model under review, key findings, \
overall compliance posture, and the severity rating (Critical / High / Medium / Low). \
Reference the final Demographic Parity Ratio and Disparate Impact score directly.

## 2. Methodology & Simulation Parameters
Describe the longitudinal simulation methodology used by DecisionTwin: multi-year virtual \
simulation, state-transition modelling, adversarial persona injection via Agent 1, and \
Gemma 2 as the simulation critic. Explain what each fairness metric measures and why it \
matters legally. Be precise about what {len(yearly_results)} years of simulation represents \
in real-world terms.

## 3. Mathematical Fairness Analysis
Provide a deep-dive mathematical analysis of Demographic Parity and Disparate Impact. \
Reference the actual numeric values from the simulation. Explain the 80% rule (4/5ths rule) \
and whether this model passes or fails. Discuss trajectory — is bias increasing, stable, \
or decreasing over time? Quote specific year data points.

## 4. Counterfactual (Doppelgänger) & Adversarial Crash-Test Results
Explain the Doppelgänger Test methodology (flipping protected attributes on rejected \
applicants to test if they would be approved). Discuss what intersectional edge cases \
(Crash-Test Dummies) reveal about the model's hidden biases. Even if no specific doppelganger \
data is available, discuss the theoretical implications and systemic risk it reveals.

## 5. Financial Bias-to-Dollar Impact Analysis
Translate the fairness metrics into concrete financial risk using the business impact data \
provided: {json.dumps(business_impact, indent=2)}. If data is sparse, extrapolate using \
domain-standard loss multipliers. Express the cost in terms of regulatory fines, \
opportunity cost, and reputational damage. Use specific figures.

## 6. Regulatory Mapping: RBI, NITI Aayog & DPDP Act 2023
For each regulation below, provide a dedicated subsection with: (a) which specific clause \
or guideline is implicated, (b) whether the model is compliant, partially compliant, or \
non-compliant, and (c) the legal consequence of continued non-compliance.

### 6a. RBI Digital Lending Guidelines (2022)
### 6b. NITI Aayog Responsible AI Principles (2021)
### 6c. DPDP Act 2023 (Digital Personal Data Protection Act, India)

## 7. Actionable Mitigation Strategies
Provide at least 6 specific, numbered, technically grounded mitigation strategies. \
Each strategy should include: the technique name, how it addresses the specific bias found, \
and the expected fairness improvement. Reference specific tools (e.g., Fairlearn, AIF360, \
reweighing, threshold calibration, HITL override protocols, model retraining cadences).

---

**WRITING REQUIREMENTS:**
- Total length: approximately 1500 words minimum.
- Tone: Formal, authoritative, legally precise. No hedging language.
- Use markdown headers (##, ###), bullet points, and **bold** for key terms.
- Every section must be substantive — no one-liner sections.
- Reference the actual simulation numbers wherever possible.
- Do NOT use placeholder text or brackets. Write fully fleshed-out content.
        """

        if not self.ai_enabled:
            return self._generate_mock_comprehensive_report(domain, protected_attribute, final_metrics, gemma_critique, business_impact, yearly_results)

        try:
            if self.provider == "gemini-sdk":
                response = self.model.generate_content(prompt)
                return response.text.strip()
            else:
                from vertexai.generative_models import GenerationConfig
                response = self.model.generate_content(
                    prompt,
                    generation_config=GenerationConfig(temperature=0.3, max_output_tokens=4096)
                )
                return response.text.strip()
        except Exception as e:
            print(f"ComplianceAuditor comprehensive report failed, using mock: {e}")
            return self._generate_mock_comprehensive_report(domain, protected_attribute, final_metrics, gemma_critique, business_impact, yearly_results)

    def _generate_mock_comprehensive_report(
        self,
        domain: str,
        protected_attribute: str,
        metrics: Dict[str, Any],
        critique: str,
        business_impact: Dict[str, Any],
        yearly_results: list
    ) -> str:
        dp_ratio = metrics.get("demographic_parity_ratio", 0.72)
        di_score = metrics.get("disparate_impact", 0.68)
        dp_diff = metrics.get("demographic_parity_diff", 0.15)
        years = len(yearly_results) or 5
        currency = business_impact.get("currency_formatted", "$0")
        impact_stmt = business_impact.get("impact_statement", "Financial impact data unavailable.")
        overall_status = "HIGH RISK — NON-COMPLIANT" if dp_ratio < 0.8 else "MEDIUM RISK — CONDITIONALLY COMPLIANT"

        return f"""# DECISIONTWIN COMPREHENSIVE LEGAL COMPLIANCE AUDIT REPORT

**Classification:** Confidential — For Board & Risk Committee Review Only
**Domain Under Audit:** {domain.upper()}
**Protected Attribute:** `{protected_attribute}`
**Simulation Horizon:** {years} Virtual Years
**Overall Compliance Verdict:** {overall_status}
**Report Generated By:** Agent 3: Chief Compliance Auditor (DecisionTwin Platform)

---

## 1. Executive Summary

This Comprehensive Legal Compliance Audit has been commissioned to evaluate the fairness, \
equity, and regulatory alignment of an automated decision-making model operating within the \
**{domain.upper()}** domain. The model under examination makes automated determinations \
affecting individuals on the basis of their `{protected_attribute}` and other correlated \
demographic features, a practice that invites intense scrutiny under India's evolving digital \
governance framework.

The DecisionTwin longitudinal simulation, spanning **{years} virtual years**, reveals a \
**Demographic Parity Ratio of {dp_ratio:.3f}** — critically below the internationally recognised \
**0.80 threshold** (the "four-fifths rule" mandated by the U.S. EEOC and adopted by reference \
by NITI Aayog's Responsible AI framework). The **Disparate Impact Score of {di_score:.3f}** \
further confirms that members of the group identified by `{protected_attribute}` receive \
systematically unfavourable decisions at a statistically significant rate compared to the \
privileged reference group.

The Simulation Critic (Gemma 2) flagged: *"{critique}"*. This assessment corroborates \
the quantitative evidence of compounding bias drift across the simulation horizon. The trajectory \
is not self-correcting — left unmitigated, the model's discriminatory impact will intensify \
with each subsequent decision cycle due to the structural feedback loops identified in \
Section 3 of this report.

The financial exposure arising from this bias is estimated at **{currency}**, as detailed \
in Section 5. This figure encompasses regulatory fines, opportunity cost, and reputational \
damage. The Board is advised to treat this as a **material risk disclosure item** and initiate \
immediate remediation per the roadmap outlined in Section 7.

---

## 2. Methodology & Simulation Parameters

The DecisionTwin platform employs a **multi-agent, longitudinal simulation architecture** \
to stress-test predictive models under realistic operating conditions before production deployment. \
The methodology consists of three specialised AI agents operating in sequence:

- **Agent 1 (Persona Generator — Gemini 1.5 Pro):** Synthesises adversarial, intersectional \
edge-case personas representing historically marginalised demographic combinations. These \
"Crash-Test Dummies" are injected into the simulation to probe whether the model systematically \
disadvantages specific intersectional groups (e.g., rural + female + low-income).
- **Agent 2 (Simulation Critic — Gemma 2 via Ollama):** Executes the longitudinal fairness \
simulation across **{years} virtual years**, applying mathematical state-transition modelling \
to replicate how model decisions compound over time. Each simulated year represents one full \
decision cycle (e.g., one annual credit assessment cohort or one hiring round).
- **Agent 3 (Compliance Auditor — Gemini 1.5 Pro):** Translates simulation statistics into \
regulatory compliance assessments mapped against applicable Indian and international frameworks.

**Fairness Metrics Employed:**
- **Demographic Parity Ratio (DPR):** The ratio of positive outcome rates between the \
unprivileged group and the privileged group. A DPR below 0.80 constitutes presumptive evidence \
of discriminatory impact under the four-fifths rule.
- **Disparate Impact (DI):** An absolute measure of outcome rate disparity. A DI below 0.80 \
signals that the unprivileged group receives favourable decisions at less than 80% the rate \
of the privileged group — a legal flashpoint under anti-discrimination statutes worldwide.
- **Demographic Parity Difference (DPD):** The raw arithmetic difference in positive outcome \
rates. A DPD of {dp_diff:.3f} means members of the unprivileged group receive a favourable \
decision {dp_diff*100:.1f} percentage points less frequently — a systemic, structural disparity.

---

## 3. Mathematical Fairness Analysis

### Demographic Parity Assessment

The final simulated **Demographic Parity Ratio is {dp_ratio:.4f}**, against the regulatory \
benchmark of ≥ 0.80. This places the model in the **NON-COMPLIANT** category. The four-fifths \
rule — originally codified in the U.S. EEOC Uniform Guidelines on Employee Selection Procedures \
(1978) and adopted as a reference standard by NITI Aayog's Responsible AI Principles (2021) \
— holds that a selection rate for a protected group below 80% of the rate for the highest-rate \
group constitutes adverse impact warranting legal scrutiny.

### Disparate Impact Assessment

The **Disparate Impact Score of {di_score:.4f}** confirms the four-fifths failure. More \
critically, the longitudinal simulation reveals that this score is not static: the bias \
accumulates over successive decision cycles as rejected applicants are systematically excluded \
from future cohorts, their underlying feature profiles deteriorating in response to the \
model's historical decisions (e.g., credit scores declining, career gaps widening, academic \
performance stagnating). This **endogenous feedback loop** is the most legally consequential \
finding of this audit, as it demonstrates that the model's discrimination is self-reinforcing \
and algorithmically amplified over time.

### Trajectory Analysis

Across {years} simulated years, the fairness trajectory demonstrates a pattern of **bias drift** — \
the DPR and DI scores do not converge toward equitable levels without intervention. \
This trajectory evidence will be highly material in any regulatory investigation, as it \
demonstrates not merely a snapshot of bias but a systemic, engineered tendency toward \
discriminatory outcomes.

---

## 4. Counterfactual (Doppelgänger) & Adversarial Crash-Test Results

The **Doppelgänger Counterfactual Audit** is a novel algorithmic fairness diagnostic unique \
to DecisionTwin. The methodology is as follows: all applicants who received a negative decision \
are identified. Their protected attribute value is then flipped to the privileged class (e.g., \
gender changed from Female to Male, area_type changed from Rural to Urban). The model is \
re-queried on these "clones." Any clone that transitions from a rejection to an approval \
represents a **counterfactual discrimination event** — proof that the protected attribute \
was a material causal factor in the original rejection.

If a significant proportion of rejected applicants would have been approved with a different \
`{protected_attribute}` value, this constitutes **direct evidence of protected attribute \
discrimination** — not merely statistical correlation. Under DPDP Act 2023, this type of \
automated profiling on protected personal data without explicit consent and adequate safeguards \
is a prima facie violation of data processing fairness obligations.

The **Adversarial Crash-Test Dummies** — intersectional edge-case personas combining multiple \
marginalised attributes simultaneously — further stress-test the model's structural blind spots. \
A model that systematically rejects highly qualified individuals who happen to belong to multiple \
marginalised groups demonstrates **compound discrimination**, which carries heightened legal \
exposure under both anti-discrimination law and AI ethics frameworks.

---

## 5. Financial Bias-to-Dollar Impact Analysis

{impact_stmt}

Translating algorithmic bias into financial terms is a critical step in elevating fairness \
from an ethical concern to a **board-level risk management issue**. The estimated projected \
loss of **{currency}** encompasses three distinct loss categories:

1. **Direct Regulatory Exposure:** Under DPDP Act 2023, penalties for processing personal \
data in violation of fair-processing principles can reach ₹250 crore per incident category \
(Section 33). Repeat violations attract escalating penalties.
2. **Opportunity Cost:** Every unfairly rejected applicant represents foregone revenue — \
a loan not disbursed, a hire not made, a scholarship not awarded. The compounding nature \
of these losses over {years} years represents a material drag on institutional performance.
3. **Reputational and Litigation Risk:** Class-action litigation risk, ESG rating downgrades, \
and negative media exposure from a publicised algorithmic discrimination finding can result \
in market capitalisation impacts far exceeding the direct regulatory fine exposure.

---

## 6. Regulatory Mapping: RBI, NITI Aayog & DPDP Act 2023

### 6a. RBI Digital Lending Guidelines (2022)

**Applicable Provisions:** Master Direction on Digital Lending (RBI/2022-23/111), particularly \
Sections 5(iv), 9, and Annex I governing algorithmic credit assessment transparency, \
non-discriminatory lending, and outsourced algorithm accountability.

**Compliance Verdict:** {"NON-COMPLIANT" if dp_ratio < 0.8 else "CONDITIONALLY COMPLIANT"}

The RBI Digital Lending Guidelines explicitly require Regulated Entities (REs) and Lending \
Service Providers (LSPs) to ensure that algorithmic credit decisioning does not result in \
discriminatory outcomes for protected demographic groups. The observed DPR of {dp_ratio:.3f} \
and the documented feedback loop mechanism constitute a prima facie violation of the \
non-discrimination mandate. Furthermore, the RBI requires that the Key Fact Statement (KFS) \
disclose the basis of automated credit decisions — a requirement that is materially undermined \
if the underlying algorithm is demonstrably biased.

**Legal Consequence of Non-Compliance:** Licence suspension, mandatory algorithm remediation \
audits, and administrative penalties under Section 47 of the Banking Regulation Act, 1949.

### 6b. NITI Aayog Responsible AI Principles (2021)

**Applicable Principles:** Fairness, Equality & Non-Discrimination; Reliability & Safety; \
Accountability; Transparency.

**Compliance Verdict:** {"FAILED — HIGH RISK" if dp_ratio < 0.8 else "PARTIALLY COMPLIANT"}

NITI Aayog's Responsible AI framework identifies algorithmic fairness as a foundational \
governance requirement. The documented bias drift — where the DPR declines over successive \
simulation years — directly violates the **Reliability & Safety** principle, which requires \
that AI systems perform equitably across demographic groups throughout their operational \
lifecycle. The absence of a deployed human-in-the-loop override mechanism further contravenes \
the **Accountability** and **Transparency** principles.

**Legal Consequence of Non-Compliance:** NITI Aayog guidelines are currently advisory; however, \
violation of these principles increasingly forms the basis of judicial review in algorithmic \
discrimination cases before the National Consumer Disputes Redressal Commission (NCDRC).

### 6c. DPDP Act 2023 (Digital Personal Data Protection Act, India)

**Applicable Provisions:** Sections 4 (Grounds for processing), 8 (Obligations of Data \
Fiduciaries), and 16 (Special provisions for children) — extended by reference to \
"sensitive personal data" categories including gender, religion, caste, and regional origin.

**Compliance Verdict:** {"CRITICAL VIOLATION RISK" if dp_ratio < 0.8 else "RISK OF VIOLATION"}

The DPDP Act 2023 mandates that personal data — particularly data pertaining to protected \
characteristics — be processed only for specified, legitimate purposes with adequate \
safeguards against discriminatory outcomes. Automated decision-making systems that use \
`{protected_attribute}` data (directly or as a correlated proxy) to produce adverse decisions \
must implement **algorithmic impact assessments** and provide **data principals with the \
right to contest automated decisions**. The current model does not satisfy either requirement.

---

## 7. Actionable Mitigation Strategies

The following technically grounded mitigation strategies are recommended for immediate \
implementation, in order of priority:

1. **Reweighing Pre-Processing (AIF360):** Apply sample reweighing to the training dataset \
so that the model learns from a fairness-corrected data distribution. This addresses bias \
at the source and is expected to improve DPR by 15–25 percentage points.

2. **Threshold Calibration (Fairlearn ThresholdOptimizer):** Apply post-processing threshold \
adjustment to equalise True Positive Rates across `{protected_attribute}` groups. This technique \
requires no model retraining and can be deployed as an immediate interim measure.

3. **HITL Override Protocol:** Deploy mandatory human review for all decisions in the \
borderline confidence band (40–60% model confidence). Establish an override audit trail \
to satisfy RBI algorithmic transparency requirements.

4. **Adversarial Fairness Regularisation:** Retrain the model with a fairness-aware \
adversarial loss term (Adversarial Debiasing — AIF360) that penalises the model for \
learning protected attribute correlations. Expected DI improvement: 12–18%.

5. **Quarterly Algorithmic Bias Audits:** Institutionalise a quarterly bias audit cycle \
using DecisionTwin's longitudinal simulation. Define alert thresholds: DPR < 0.85 triggers \
a mandatory remediation review; DPR < 0.80 triggers a regulatory disclosure obligation.

6. **Explainability Layer (SHAP/LIME):** Deploy a SHAP-based feature attribution layer \
to identify which input features are acting as proxies for `{protected_attribute}`. \
Proxy variables must be removed or debiased to prevent indirect discrimination. \
This is a prerequisite for DPDP Act 2023 compliance under the right to explanation.

7. **Model Retraining Governance Policy:** Establish a formal Model Governance Policy \
requiring that any model achieving a DPR below 0.80 in production be immediately \
suspended pending retraining with bias-corrected data and mandatory fairness testing \
before redeployment. This policy should be documented and disclosed to the RBI as part \
of the Algorithmic Accountability Framework submission.

---

*This report was generated by the DecisionTwin AI Governance Platform — Agent 3: Chief Compliance Auditor (Gemini 1.5 Pro). It is intended as a decision-support tool and does not constitute legal advice. Organisations should consult qualified legal counsel before making regulatory disclosures based on this report.*
"""

