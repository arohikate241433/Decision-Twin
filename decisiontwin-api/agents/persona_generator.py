import os
import json
import numpy as np
import pandas as pd
from typing import List, Dict, Any


class PersonaGenerator:
    def __init__(self):
        self.ai_enabled = False
        self.provider = None

        # Check for Vertex AI env (standard for GCP) or Gemini SDK env
        if os.environ.get("GOOGLE_API_KEY"):
            try:
                import google.generativeai as genai
                genai.configure(api_key=os.environ.get("GOOGLE_API_KEY"))
                self.model = genai.GenerativeModel('gemini-1.5-pro')
                self.provider = "gemini-sdk"
                self.ai_enabled = True
                print("PersonaGenerator: Initialized using google-generativeai SDK")
            except Exception as e:
                print(f"PersonaGenerator: Failed to initialize google-generativeai: {e}")

        if not self.ai_enabled:
            # Try Vertex AI as fallback or default
            try:
                import vertexai
                from vertexai.generative_models import GenerativeModel, GenerationConfig
                project = os.environ.get("GOOGLE_CLOUD_PROJECT", "decisiontwin-hackathon")
                location = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")
                vertexai.init(project=project, location=location)
                self.model = GenerativeModel("gemini-1.5-pro-preview-0409")
                self.provider = "vertexai"
                self.ai_enabled = True
                print("PersonaGenerator: Initialized using Vertex AI SDK")
            except Exception as e:
                print(f"PersonaGenerator: Vertex AI not initialized, using mock fallback: {e}")

    # ─────────────────────────────────────────────────────────────────────────
    # Standard Adversarial Persona Generation (used by /run-simulation)
    # ─────────────────────────────────────────────────────────────────────────

    def generate_personas(self, base_df: pd.DataFrame, domain: str, count: int = 20) -> List[Dict[str, Any]]:
        """
        Ingests the base dataframe, analyzes schema and values, and generates
        diverse, adversarial 'edge-case' personas to stress-test the simulation.
        """
        columns = list(base_df.columns)
        sample_data = base_df.head(10).to_dict(orient="records")

        schema_info = {
            "columns": columns,
            "sample_records": sample_data
        }

        adversarial_guidance = ""
        if domain.lower() == "lending":
            adversarial_guidance = (
                "Generate personas with historical disadvantages, e.g., rural self-employed individuals, "
                "low-income female applicants, or individuals from historically redlined areas. Provide realistic "
                "combinations of attributes (e.g. low credit score but stable business income) that stress-test lending models."
            )
        elif domain.lower() == "scholarship":
            adversarial_guidance = (
                "Generate personas representing underrepresented groups, rural first-generation college students, "
                "or applicants with low family incomes but exceptional academic progress indicators. Challenge the scholarship selection bias."
            )
        elif domain.lower() == "hiring":
            adversarial_guidance = (
                "Generate personas representing non-traditional backgrounds, such as self-taught older workers, "
                "female candidates with career breaks, or minority ethnic candidates with strong vocational training but lower formal education."
            )
        else:
            adversarial_guidance = (
                "Generate diverse, intersectional edge cases containing protected attributes and borderline feature "
                "combinations to stress-test systemic bias in classifications."
            )

        prompt = f"""
        You are 'Agent 1: Persona Generator', an AI agent designed to generate synthetic, diverse, and adversarial "edge-case" personas to stress-test predictive models.
        
        Domain Pack: {domain.upper()}
        Target Record Count: {count}
        
        Base Dataset Schema & Samples:
        {json.dumps(schema_info, indent=2)}
        
        Adversarial Criteria:
        {adversarial_guidance}
        
        INSTRUCTIONS:
        1. Generate exactly {count} distinct personas.
        2. Ensure the output strictly follows the schema of the base dataset, maintaining identical column names and data types (e.g., if a column is numeric/float, generate numeric/float values).
        3. Do NOT include the target output column (if present in the columns: e.g., 'approved', 'selected', 'hired') in the 'traits' structure, as these personas are meant to be evaluated by the classifier.
        4. Focus on adversarial edge cases—intersectional groups (e.g. combination of rural, low income, minority gender) that are underrepresented or historically biased against.
        
        Format the output strictly as a JSON list of objects. Each object must have:
        - "persona_id": A unique string (e.g. "synthetic_01")
        - "traits": A dictionary containing key-value pairs matching the columns of the base dataset.
        - "metadata": A short explanation of why this persona was generated as an adversarial edge case.
        
        Do not add any markdown wrapper like ```json or trailing text. Output ONLY the raw valid JSON.
        """

        if not self.ai_enabled:
            return self._generate_mock_fallback(base_df, domain, count)

        try:
            if self.provider == "gemini-sdk":
                response = self.model.generate_content(prompt)
                response_text = response.text.strip()
            else:
                from vertexai.generative_models import GenerationConfig
                response = self.model.generate_content(
                    prompt,
                    generation_config=GenerationConfig(
                        temperature=0.7,
                        response_mime_type="application/json"
                    )
                )
                response_text = response.text.strip()

            # Clean response text if wrapped in markdown block
            if response_text.startswith("```"):
                lines = response_text.splitlines()
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines[-1].startswith("```"):
                    lines = lines[:-1]
                response_text = "\n".join(lines).strip()

            personas = json.loads(response_text)
            if isinstance(personas, dict) and "personas" in personas:
                personas = personas["personas"]

            return personas

        except Exception as e:
            print(f"PersonaGenerator API call failed, falling back to mock: {e}")
            return self._generate_mock_fallback(base_df, domain, count)

    def _generate_mock_fallback(self, base_df: pd.DataFrame, domain: str, count: int) -> List[Dict[str, Any]]:
        """Fallback mock generator using simple random variations of the base dataset"""
        personas = []
        columns = [col for col in base_df.columns if col not in ['approved', 'selected', 'hired']]

        for i in range(count):
            traits = {}
            for col in columns:
                val = base_df[col].iloc[i % len(base_df)]
                if pd.api.types.is_numeric_dtype(base_df[col]):
                    std = base_df[col].std()
                    if pd.isna(std):
                        std = 1.0
                    perturb = np.random.normal(0, std * 0.1)
                    if pd.api.types.is_integer_dtype(base_df[col]):
                        traits[col] = int(max(base_df[col].min(), min(base_df[col].max(), val + perturb)))
                    else:
                        traits[col] = float(max(base_df[col].min(), min(base_df[col].max(), val + perturb)))
                else:
                    if np.random.rand() > 0.5:
                        traits[col] = np.random.choice(base_df[col].dropna().unique())
                    else:
                        traits[col] = val

            metadata = "Mocked adversarial persona representing "
            if domain.lower() == "lending":
                if traits.get("gender") == "Female" and traits.get("credit_score", 700) < 620:
                    metadata += "a rural female applicant with a borderline credit score."
                else:
                    metadata += "an edge-case self-employed credit applicant."
            elif domain.lower() == "scholarship":
                if traits.get("rural_urban") == "Rural" and traits.get("family_income", 50000) < 30000:
                    metadata += "a low-income rural first-generation student."
                else:
                    metadata += "an underrepresented academic applicant."
            else:
                metadata += "an intersectional demographic edge case."

            personas.append({
                "persona_id": f"mock_synth_{i}",
                "traits": traits,
                "metadata": {"reason": metadata, "source": "mock_generator"}
            })

        return personas

    # ─────────────────────────────────────────────────────────────────────────
    # Crash-Test Dummies (used by /run-crash-test endpoint)
    # ─────────────────────────────────────────────────────────────────────────

    def generate_crash_test_dummies(self, columns: list, domain: str, count: int = 5) -> list:
        """
        Agent 1: Adversarial Stress Tester.
        Generates intersectional edge-case 'Crash-Test Dummy' personas specifically engineered
        to expose hidden bias by combining multiple marginalized attributes simultaneously.
        """
        prompt = f"""
You are an 'Adversarial AI Safety Tester'. Your job is to generate "Digital Crash-Test Dummies" — \
synthetic personas that are specifically designed to find hidden bias and break AI models.

Domain: {domain.upper()}
Dataset Columns: {json.dumps(columns)}
Target Dummy Count: {count}

INSTRUCTIONS:
1. Generate exactly {count} "Crash-Test Dummy" profiles.
2. Each profile MUST be an "Intersectional Edge Case" — a person who belongs to MULTIPLE marginalised or \
historically disadvantaged groups simultaneously. Examples: 'low-income + rural + female', \
'older worker + minority ethnicity + employment gap', 'first-generation student + disability + low family income'.
3. The profiles must use ONLY the provided column names: {json.dumps(columns)}. \
Do NOT include target/outcome columns (e.g. 'approved', 'hired', 'selected').
4. Generate realistic, plausible numeric and categorical values matching typical data ranges.
5. For each dummy, write an 'adversarial_description' — a 1-2 sentence plain-English description of WHY \
this persona is a stress test.

Output ONLY a valid JSON array (no markdown wrappers). Each element must have:
- "persona_id": string (e.g. "crash_dummy_01")
- "traits": dict with keys matching the provided columns (excluding outcome columns)
- "adversarial_description": string
        """

        if not self.ai_enabled:
            return self._mock_crash_dummies(columns, domain, count)

        try:
            if self.provider == "gemini-sdk":
                response = self.model.generate_content(prompt)
                response_text = response.text.strip()
            else:
                from vertexai.generative_models import GenerationConfig
                response = self.model.generate_content(
                    prompt,
                    generation_config=GenerationConfig(temperature=0.8)
                )
                response_text = response.text.strip()

            # Strip markdown code fences if present
            if response_text.startswith("```"):
                lines = response_text.splitlines()
                lines = [line for line in lines if not line.startswith("```")]
                response_text = "\n".join(lines).strip()

            dummies = json.loads(response_text)
            if isinstance(dummies, dict) and "dummies" in dummies:
                dummies = dummies["dummies"]
            return dummies

        except Exception as e:
            print(f"Crash-test dummy generation failed, using mock: {e}")
            return self._mock_crash_dummies(columns, domain, count)

    def _mock_crash_dummies(self, columns: list, domain: str, count: int) -> list:
        """Heuristic mock fallback for crash-test dummies."""
        templates = {
            "lending": [
                {"adversarial_description": "Low-income rural female applicant with borderline credit score and self-employment income.", "overrides": {"gender": "Female", "employment_type": "Self-employed", "area_type": "Rural"}},
                {"adversarial_description": "Elderly minority applicant with no formal credit history despite stable income.", "overrides": {"age": 62, "credit_score": 580}},
                {"adversarial_description": "Young single mother with high debt-to-income ratio due to medical expenses.", "overrides": {"gender": "Female", "marital_status": "Single"}},
                {"adversarial_description": "Immigrant applicant with short credit history despite high income.", "overrides": {"credit_score": 600}},
                {"adversarial_description": "Disabled veteran with irregular income history and rural address.", "overrides": {"area_type": "Rural"}},
            ],
            "hiring": [
                {"adversarial_description": "Highly experienced female engineer with 3-year career gap due to caregiving.", "overrides": {"gender": "Female", "experience_years": 12}},
                {"adversarial_description": "Older minority candidate with vocational training but no formal degree.", "overrides": {"age": 55}},
                {"adversarial_description": "Non-binary candidate from rural area with non-traditional education pathway.", "overrides": {}},
                {"adversarial_description": "Single parent with part-time work history despite strong skills.", "overrides": {}},
                {"adversarial_description": "Refugee background candidate with foreign credentials and accent bias risk.", "overrides": {}},
            ],
            "scholarship": [
                {"adversarial_description": "First-generation rural student with exceptional grades but very low family income.", "overrides": {"rural_urban": "Rural"}},
                {"adversarial_description": "Female STEM applicant from low-income minority community.", "overrides": {"gender": "Female"}},
                {"adversarial_description": "Disabled student with caregiving responsibilities limiting extracurricular participation.", "overrides": {}},
                {"adversarial_description": "Immigrant student with strong academic record but language barrier indicators.", "overrides": {}},
                {"adversarial_description": "Student from conflict-affected region with interrupted schooling but high potential.", "overrides": {}},
            ],
        }
        domain_templates = templates.get(domain.lower(), templates["lending"])
        dummies = []
        for i in range(min(count, len(domain_templates))):
            tmpl = domain_templates[i]
            # Build traits from available columns (exclude outcome cols)
            outcome_cols = {"approved", "hired", "selected"}
            traits = {}
            for col in columns:
                if col not in outcome_cols:
                    traits[col] = "N/A"
            traits.update({k: v for k, v in tmpl.get("overrides", {}).items() if k in traits})
            dummies.append({
                "persona_id": f"crash_dummy_{i + 1:02d}",
                "traits": traits,
                "adversarial_description": tmpl["adversarial_description"],
            })
        return dummies
