import os
import json
import io
import shutil
import pandas as pd
import numpy as np
from fastapi import FastAPI, HTTPException, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from agents.persona_generator import PersonaGenerator
from agents.simulation_critic import SimulationCritic
from agents.compliance_auditor import ComplianceAuditor

app = FastAPI(
    title="DecisionTwin API", 
    description="Multi-Agent AI Fairness, Simulation, and Governance Platform Backend"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Active Session In-Memory Database
SESSION = {
    "df": None,
    "model_path": None,
    "domain": "lending",
    "protected_attribute": "gender",
    "target_outcome": "approved",
    "simulation_results": None,
    "hitl_overrides": {},  # {year: {row_index: decision}}
    "years_simulated": 5
}

# Initialize Agents
persona_gen = PersonaGenerator()
sim_critic = SimulationCritic()
compliance_aud = ComplianceAuditor()

# Ensure temp directory for uploaded models
TEMP_DIR = "temp_uploads"
os.makedirs(TEMP_DIR, exist_ok=True)
MOCK_DIR = "mock_data"
os.makedirs(MOCK_DIR, exist_ok=True)

# Generate mock datasets and models if they don't exist on startup
try:
    if not os.path.exists(os.path.join(MOCK_DIR, "lending_mock.csv")):
        print("Mock data missing, generating Lending, Scholarship, and Hiring packs...")
        import generate_mock_data
        generate_mock_data.main()
        print("Mock packs generated successfully.")
except Exception as e:
    print(f"Failed to pre-generate mock packs on startup: {e}")

@app.get("/health")
def health_check():
    return {
        "status": "ok", 
        "message": "DecisionTwin API is running",
        "agents": {
            "persona_generator": persona_gen.ai_enabled,
            "simulation_critic": sim_critic.vertex_initialized or os.environ.get("OLLAMA_URL") is not None,
            "compliance_auditor": compliance_aud.ai_enabled
        }
    }

@app.get("/session")
def get_session():
    """Returns the current session state metadata"""
    return {
        "has_data": SESSION["df"] is not None,
        "model_path": SESSION["model_path"],
        "domain": SESSION["domain"],
        "protected_attribute": SESSION["protected_attribute"],
        "target_outcome": SESSION["target_outcome"],
        "years_simulated": SESSION["years_simulated"],
        "row_count": len(SESSION["df"]) if SESSION["df"] is not None else 0,
        "columns": list(SESSION["df"].columns) if SESSION["df"] is not None else []
    }

@app.post("/upload-data")
async def upload_data(
    file: Optional[UploadFile] = File(None),
    model_file: Optional[UploadFile] = File(None),
    domain: str = Form("lending"),
    protected_attribute: str = Form("gender"),
    target_outcome: str = Form("approved"),
    use_mock: bool = Form(False)
):
    """
    Ingests CSV dataset and custom .pkl / .onnx models.
    Supports using pre-trained mock datasets and models if use_mock is true.
    """
    try:
        SESSION["domain"] = domain
        SESSION["protected_attribute"] = protected_attribute
        SESSION["target_outcome"] = target_outcome
        SESSION["hitl_overrides"] = {} # Clear overrides on new upload
        SESSION["simulation_results"] = None
        
        # 1. Handle Mock Data fallback or request
        if use_mock or file is None:
            mock_csv_path = os.path.join(MOCK_DIR, f"{domain}_mock.csv")
            mock_model_path = os.path.join(MOCK_DIR, f"{domain}_model.pkl")
            
            if not os.path.exists(mock_csv_path) or not os.path.exists(mock_model_path):
                # Fallback to create them dynamically if they don't exist yet
                raise HTTPException(
                    status_code=400, 
                    detail=f"Mock data for domain '{domain}' not found. Please run the mock data generator first."
                )
            
            SESSION["df"] = pd.read_csv(mock_csv_path)
            SESSION["model_path"] = mock_model_path
            return {
                "status": "success",
                "message": f"Successfully loaded pre-trained mock pack for '{domain}'",
                "columns": list(SESSION["df"].columns),
                "row_count": len(SESSION["df"])
            }

        # 2. Handle Custom CSV File Upload
        content = await file.read()
        df = pd.read_csv(io.StringIO(content.decode('utf-8')))
        SESSION["df"] = df

        # 3. Handle Custom Model File Upload
        if model_file is not None:
            filename = model_file.filename
            file_extension = os.path.splitext(filename)[1].lower()
            if file_extension not in ['.pkl', '.onnx']:
                raise HTTPException(
                    status_code=400, 
                    detail="Model must be in .pkl (joblib/pickle) or .onnx format"
                )
                
            dest_path = os.path.join(TEMP_DIR, filename)
            with open(dest_path, "wb") as buffer:
                shutil.copyfileobj(model_file.file, buffer)
            SESSION["model_path"] = dest_path
        else:
            # Fallback to domain-specific mock model
            mock_model_path = os.path.join(MOCK_DIR, f"{domain}_model.pkl")
            if os.path.exists(mock_model_path):
                SESSION["model_path"] = mock_model_path
            else:
                SESSION["model_path"] = None

        return {
            "status": "success",
            "message": f"Successfully uploaded custom dataset with {len(df)} records.",
            "columns": list(df.columns),
            "row_count": len(df),
            "custom_model_uploaded": model_file is not None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

class SyntheticDataRequest(BaseModel):
    persona_count: int = 100
    characteristics: List[str] = []

@app.post("/generate-synthetic-data")
def generate_synthetic_data(request: SyntheticDataRequest):
    """
    Generates standalone synthetic personas based on the active dataset schema.
    """
    if SESSION["df"] is None:
        raise HTTPException(status_code=400, detail="No dataset uploaded in active session.")
    try:
        personas = persona_gen.generate_personas(
            SESSION["df"], 
            SESSION["domain"], 
            count=request.persona_count
        )
        return {"status": "success", "data": personas}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Persona generation failed: {str(e)}")

@app.post("/run-simulation")
def run_simulation(
    years: int = 5,
    generate_personas: bool = False,
    adversarial_count: int = 15
):
    """
    Executes the multi-agent longitudinal simulation.
    If generate_personas is True, Agent 1 (Gemini) generates synthetic adversarial personas
    which are appended to the dataset before Agent 2 runs the longitudinal simulation.
    """
    if SESSION["df"] is None:
        raise HTTPException(status_code=400, detail="No dataset uploaded in active session.")
    if SESSION["model_path"] is None:
        raise HTTPException(status_code=400, detail="No prediction model loaded. Upload a model or select a domain pack.")

    try:
        SESSION["years_simulated"] = years
        df_to_simulate = SESSION["df"].copy()
        
        # Agent 1: Generate adversarial edge-case personas and append
        adversarial_personas = []
        if generate_personas:
            try:
                raw_personas = persona_gen.generate_personas(
                    SESSION["df"], 
                    SESSION["domain"], 
                    count=adversarial_count
                )
                
                # Convert list of persona objects into a clean pandas DataFrame
                new_records = []
                for p in raw_personas:
                    traits = p.get("traits", {})
                    # Add missing columns with default/NaN if needed
                    for col in df_to_simulate.columns:
                        if col not in traits and col != SESSION["target_outcome"]:
                            traits[col] = None
                    new_records.append(traits)
                
                df_personas = pd.DataFrame(new_records)
                # Concatenate with active dataset
                df_to_simulate = pd.concat([df_to_simulate, df_personas], ignore_index=True)
                df_to_simulate = df_to_simulate.ffill().bfill()  # Handle NaNs from formatting mismatches
                
                # Track generated personas for visual logging
                adversarial_personas = raw_personas
            except Exception as e:
                print(f"Agent 1 persona generation failed: {e}")
        
        # Agent 2: Run longitudinal simulation
        results = sim_critic.simulate_longitudinal_loop(
            initial_df=df_to_simulate,
            model_path=SESSION["model_path"],
            protected_attribute=SESSION["protected_attribute"],
            target_outcome=SESSION["target_outcome"],
            domain=SESSION["domain"],
            years=years,
            hitl_overrides=SESSION["hitl_overrides"]
        )
        
        SESSION["simulation_results"] = results
        
        return {
            "status": "success",
            "years_simulated": years,
            "adversarial_personas_count": len(adversarial_personas),
            "adversarial_personas": adversarial_personas,
            "gemma_critique": results["gemma_critique"],
            "yearly_results": [
                {
                    "year": r["year"],
                    "metrics": r["metrics"],
                    "average_target_rate": r["average_target_rate"],
                    "borderline_cases": r["borderline_cases"],
                    "data_snapshot": r.get("data_snapshot", []),
                    "decisions": r.get("decisions", [])
                }
                for r in results["yearly_results"]
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Simulation failed: {str(e)}")

class OverrideRequest(BaseModel):
    year: int
    row_index: int
    new_decision: int  # 0 or 1

@app.post("/override-decision")
def override_decision(request: OverrideRequest):
    """
    Applies a human-in-the-loop override for a borderline case at a specific year.
    Updates the session override list and recalculates the simulation.
    """
    if SESSION["df"] is None:
        raise HTTPException(status_code=400, detail="No dataset uploaded in active session.")
    
    # Store override
    year = request.year
    if year not in SESSION["hitl_overrides"]:
        SESSION["hitl_overrides"][year] = {}
        
    SESSION["hitl_overrides"][year][request.row_index] = request.new_decision
    
    # Re-run simulation dynamically using the overrides
    try:
        results = sim_critic.simulate_longitudinal_loop(
            initial_df=SESSION["df"],
            model_path=SESSION["model_path"],
            protected_attribute=SESSION["protected_attribute"],
            target_outcome=SESSION["target_outcome"],
            domain=SESSION["domain"],
            years=SESSION["years_simulated"],
            hitl_overrides=SESSION["hitl_overrides"]
        )
        SESSION["simulation_results"] = results
        
        return {
            "status": "success",
            "message": f"Successfully applied override at Year {year}, Index {request.row_index}.",
            "yearly_results": [
                {
                    "year": r["year"],
                    "metrics": r["metrics"],
                    "average_target_rate": r["average_target_rate"],
                    "borderline_cases": r["borderline_cases"]
                }
                for r in results["yearly_results"]
            ],
            "gemma_critique": results["gemma_critique"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Recalculation failed: {str(e)}")

@app.post("/generate-report")
def generate_report():
    """
    Agent 3: Compliance Auditor.
    Translates simulation statistics and critiques into a compliance audit report.
    """
    if SESSION["simulation_results"] is None:
        raise HTTPException(status_code=400, detail="No simulation results found. Run a simulation first.")
        
    try:
        report_text = compliance_aud.generate_audit_report(
            simulation_results=SESSION["simulation_results"],
            domain=SESSION["domain"],
            protected_attribute=SESSION["protected_attribute"]
        )
        return {
            "status": "success",
            "report": report_text
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")

@app.get("/historical-simulations")
def get_historical_simulations():
    """Returns pre-loaded comparisons for the UI."""
    return {
        "status": "success",
        "simulations": [
            {
                "id": "sim_lending_historical",
                "domain": "Lending",
                "protected_attribute": "gender",
                "demographic_parity_ratio": 0.65,
                "regulatory_risk": "High Risk",
                "date": "2026-06-12"
            },
            {
                "id": "sim_hiring_historical",
                "domain": "Hiring",
                "protected_attribute": "gender",
                "demographic_parity_ratio": 0.82,
                "regulatory_risk": "Low Risk",
                "date": "2026-06-11"
            }
        ]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)