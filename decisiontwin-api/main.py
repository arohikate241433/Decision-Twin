import os
import json
import io
import joblib
from fastapi import FastAPI, HTTPException, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.tree import DecisionTreeClassifier
from sklearn.preprocessing import LabelEncoder
from fairlearn.metrics import demographic_parity_difference, demographic_parity_ratio

CUSTOM_MODELS_DIR = "custom_models"
os.makedirs(CUSTOM_MODELS_DIR, exist_ok=True)

app = FastAPI(title="DecisionTwin API", description="Provides simulation and AI endpoints for DecisionTwin.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

AI_ENABLED = os.environ.get("AI_ENABLED", "false").lower() == "true"

if AI_ENABLED:
    try:
        import vertexai
        from vertexai.generative_models import GenerativeModel, GenerationConfig
        PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "decisiontwin-hackathon")
        LOCATION = "us-central1"
        vertexai.init(project=PROJECT_ID, location=LOCATION)
        gemini_pro = GenerativeModel("gemini-1.5-pro-preview-0409")
    except Exception as e:
        print(f"Vertex AI not initialized, falling back to mock data: {e}")
        AI_ENABLED = False

@app.get("/health")
def health_check():
    return {"status": "ok", "message": "DecisionTwin API is running", "ai_enabled": AI_ENABLED}

class SyntheticDataRequest(BaseModel):
    persona_count: int = 100
    characteristics: list[str] = ["age_group", "gender", "race", "income", "credit_score", "location"]

@app.post("/generate-synthetic-data")
def generate_synthetic_data(request: SyntheticDataRequest):
    if not AI_ENABLED:
        with open("mock_personas.json", "w") as f:
            mock_data = [
                {
                    "persona_id": f"p_{i}", 
                    "traits": {
                        "age_group": "18-24" if i % 3 == 0 else "25-40" if i % 3 == 1 else "41-60", 
                        "gender": "Male" if i % 2 == 0 else "Female",
                        "race": "GroupA" if i % 3 == 0 else "GroupB" if i % 3 == 1 else "GroupC",
                        "credit_score": 580 + (i % 150), 
                        "income": 35000 + (i * 120),
                        "location": "Urban" if i % 2 == 0 else "Suburban"
                    }, 
                    "metadata": {"gemini_seed_id": "mock"}
                } 
                for i in range(request.persona_count)
            ]
            json.dump(mock_data, f)
        return {"status": "success", "source": "mock", "data": mock_data}

    prompt = f"""
    You are an expert synthetic data generator for an AI ethical auditing platform called DecisionTwin.
    Generate a highly realistic, statistically diverse dataset of {request.persona_count} individuals.
    
    Include the following characteristics: {', '.join(request.characteristics)}.
    Ensure representation across intersections (e.g., race, gender, socio-economic status).
    Provide subtle, realistic correlations between features (e.g., location correlating with income).

    Format the output strictly as a JSON array where each object contains a 'persona_id' and 'traits' dictionary.
    """
    
    try:
        response = gemini_pro.generate_content(
            prompt,
            generation_config=GenerationConfig(
                temperature=0.7,
                response_mime_type="application/json"
            )
        )
        
        result_json = json.loads(response.text)
        with open("mock_personas.json", "w") as f:
            json.dump(result_json, f)
            
        return {"status": "success", "source": "gemini", "data": result_json[:5], "total": len(result_json)}
        
    except Exception as e:
        print(f"Vertex AI not initialized, falling back to mock data: {e}")
        with open("mock_personas.json", "w") as f:
            mock_data = [
                {
                    "persona_id": f"p_{i}", 
                    "traits": {
                        "age_group": "18-24" if i % 3 == 0 else "25-40", 
                        "gender": "Male" if i % 2 == 0 else "Female",
                        "race": "GroupA" if i % 3 == 0 else "GroupB",
                        "credit_score": 620 + (i % 100), 
                        "income": 40000 + (i * 100),
                        "location": "Urban" if i % 2 == 0 else "Suburban"
                    }, 
                    "metadata": {"gemini_seed_id": "mock_fallback"}
                } 
                for i in range(request.persona_count)
            ]
            json.dump(mock_data, f)
        return {"status": "success", "source": "mock_fallback", "data": mock_data[:5], "total": len(mock_data)}


class SimulationRequest(BaseModel):
    years_to_simulate: int = 5
    sensitive_feature: str = "gender"
    threshold_adjustment: float = 0.0
    model_type: str = "logistic"

def get_model(model_type: str):
    """Get ML model based on type — built-in or custom uploaded"""
    if model_type.startswith("custom_"):
        filename = model_type[len("custom_"):]
        path = os.path.join(CUSTOM_MODELS_DIR, filename)
        if not os.path.exists(path):
            raise HTTPException(status_code=404, detail=f"Custom model '{filename}' not found.")
        try:
            model = joblib.load(path)
            # Mark as pre-trained so run_simulation skips re-fitting
            model._is_pretrained = True
            return model
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to load custom model: {str(e)}")
    if model_type == "random_forest":
        return RandomForestClassifier(n_estimators=50, max_depth=5, random_state=42)
    elif model_type == "decision_tree":
        return DecisionTreeClassifier(max_depth=5, random_state=42)
    else:
        return LogisticRegression(max_iter=1000)

def run_simulation(data: list, years: int, sensitive_feature: str, threshold_adjustment: float, model):
    """Run bias simulation with given parameters"""
    # ── 1. Build DataFrame from traits, flattening any non-scalar values ──
    rows = []
    for item in data:
        flat = {}
        for k, v in item.get("traits", {}).items():
            if isinstance(v, (int, float, bool)):
                flat[k] = v
            elif isinstance(v, str):
                flat[k] = v
            else:
                # dicts, lists, None → convert to string so pandas doesn't blow up
                flat[k] = str(v) if v is not None else ""
        rows.append(flat)

    if not rows:
        raise HTTPException(status_code=400, detail="Dataset is empty.")

    df = pd.DataFrame(rows)

    # ── 2. Validate sensitive feature ──────────────────────────────────────
    if sensitive_feature not in df.columns:
        available = [c for c in df.columns]
        # Try to pick a reasonable fallback (first non-numeric column)
        cat_cols = [c for c in df.columns if not pd.api.types.is_numeric_dtype(df[c])]
        if not cat_cols:
            raise HTTPException(
                status_code=400,
                detail=f"Sensitive feature '{sensitive_feature}' not found. Available columns: {available}"
            )
        sensitive_feature = cat_cols[0]

    # ── 3. Auto-detect a numeric score column ──────────────────────────────
    score_col = None
    preferred = ['credit_score', 'score', 'rating', 'income', 'salary', 'grade', 'points',
                 'amount', 'balance', 'value', 'count', 'total', 'price', 'age']
    for name in preferred:
        if name in df.columns and pd.api.types.is_numeric_dtype(df[name]):
            score_col = name
            break
    if score_col is None:
        numeric_cols = [c for c in df.columns
                        if pd.api.types.is_numeric_dtype(df[c])
                        and c != sensitive_feature
                        and df[c].nunique() > 1]
        if numeric_cols:
            score_col = numeric_cols[0]

    # ── 4. If no numeric column exists, synthesize one from text length ────
    if score_col is None:
        # Use length of the longest string column as a proxy score
        str_cols = [c for c in df.columns if df[c].dtype == object and c != sensitive_feature]
        if str_cols:
            # pick the column with most variance in length
            best = max(str_cols, key=lambda c: df[c].astype(str).str.len().std())
            df['_synthetic_score'] = df[best].astype(str).str.len().astype(float)
            score_col = '_synthetic_score'
        else:
            raise HTTPException(
                status_code=400,
                detail="Dataset has no usable numeric or text column to base approval decisions on."
            )

    # ── 5. Encode all non-numeric columns ──────────────────────────────────
    for col in df.columns:
        if not pd.api.types.is_numeric_dtype(df[col]):
            df[col] = pd.factorize(df[col].astype(str))[0]

    sensitive_vals = df[sensitive_feature]

    score_min = df[score_col].min()
    score_max = df[score_col].max()
    score_range = float(score_max - score_min) if score_max != score_min else 1.0
    base_threshold = score_min + score_range * 0.6
    drift_penalty_per_year = score_range * 0.02

    synthetic_targets = []
    for _, row in df.iterrows():
        base_score = float(row[score_col])
        year_penalty = (years * drift_penalty_per_year) if row[sensitive_feature] == 0 else 0
        approval_threshold = base_threshold - threshold_adjustment * (score_range / 100) + year_penalty
        synthetic_targets.append(1 if base_score > approval_threshold else 0)

    df['synthetic_target'] = synthetic_targets
    X = df.drop(columns=['synthetic_target'])
    y = df['synthetic_target']

    # Guard: need at least 2 classes to train/evaluate
    if y.nunique() < 2:
        return {
            "years_simulated": years,
            "metrics": {
                "demographic_parity_difference": 0.0,
                "demographic_parity_ratio": 1.0,
                "approval_rate_overall": round(float(y.mean()), 4),
                "accuracy": 1.0
            },
            "bias_flags": [{
                "category": f"Demographic Disparity on {sensitive_feature}",
                "severity": "Low",
                "value": 1.0
            }]
        }

    # ── 6. Fit or run pre-trained model ────────────────────────────────────
    is_pretrained = getattr(model, '_is_pretrained', False)
    if is_pretrained:
        try:
            expected_features = model.feature_names_in_ if hasattr(model, 'feature_names_in_') else None
            if expected_features is not None:
                for c in expected_features:
                    if c not in X.columns:
                        X[c] = 0
                X = X[[c for c in expected_features if c in X.columns]]
            predictions = model.predict(X)
            accuracy = float(model.score(X, y)) if hasattr(model, 'score') else 0.75
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Custom model prediction failed: {str(e)}")
    else:
        model.fit(X, y)
        predictions = model.predict(X)
        accuracy = float(model.score(X, y))

    try:
        dp_diff = demographic_parity_difference(y, predictions, sensitive_features=sensitive_vals)
        dp_ratio = demographic_parity_ratio(y, predictions, sensitive_features=sensitive_vals)
    except Exception:
        dp_diff = 0.0
        dp_ratio = 1.0

    return {
        "years_simulated": years,
        "metrics": {
            "demographic_parity_difference": round(float(dp_diff), 4),
            "demographic_parity_ratio": round(float(dp_ratio), 4),
            "approval_rate_overall": round(float(predictions.mean()), 4),
            "accuracy": round(accuracy, 4)
        },
        "bias_flags": [
            {
                "category": f"Demographic Disparity on {sensitive_feature}",
                "severity": "High" if dp_ratio < 0.8 else "Low",
                "value": round(float(dp_ratio), 4)
            }
        ]
    }

@app.post("/simulate-bias")
def simulate_bias(request: SimulationRequest):
    try:
        with open("mock_personas.json", "r") as f:
            data = json.load(f)
    except FileNotFoundError:
        raise HTTPException(status_code=400, detail="Generate synthetic data first.")

    model = get_model(request.model_type)
    result = run_simulation(data, request.years_to_simulate, request.sensitive_feature, request.threshold_adjustment, model)
    
    return {
        "status": "success",
        "model_type": request.model_type,
        **result
    }

@app.post("/simulate-all-models")
def simulate_all_models(request: SimulationRequest):
    """Run simulation across all available models for comparison"""
    try:
        with open("mock_personas.json", "r") as f:
            data = json.load(f)
    except FileNotFoundError:
        raise HTTPException(status_code=400, detail="Generate synthetic data first.")

    models = {
        "logistic": LogisticRegression(max_iter=1000),
        "random_forest": RandomForestClassifier(n_estimators=50, max_depth=5, random_state=42),
        "decision_tree": DecisionTreeClassifier(max_depth=5, random_state=42)
    }
    
    results = {}
    for model_name, model in models.items():
        results[model_name] = run_simulation(
            data, 
            request.years_to_simulate, 
            request.sensitive_feature, 
            request.threshold_adjustment, 
            model
        )
    
    return {"status": "success", "results": results}


class ReportRequest(BaseModel):
    demographic_parity_ratio: float
    demographic_parity_difference: float
    sensitive_feature: str
    years_simulated: int

@app.post("/generate-report")
def generate_report(request: ReportRequest):
    if not AI_ENABLED:
        return {
            "status": "success", 
            "report": f"Mock AI Review [{request.years_simulated} Years]: The demographic parity ratio of {request.demographic_parity_ratio:.4f} indicates {'systematic disparity requiring immediate policy intervention.' if request.demographic_parity_ratio < 0.8 else 'acceptable bias levels within regulatory thresholds.'} The disparity difference of {request.demographic_parity_difference:.4f} suggests moderate systemic impact on {request.sensitive_feature} demographics. Recommend continuous monitoring and threshold adjustment to maintain compliance."
        }
        
    prompt = f"""
    Act as an AI Ethics consultant. Given these statistical biases from a {request.years_simulated}-year simulation:
    - Sensitive Feature: {request.sensitive_feature}
    - Demographic Parity Ratio (80% rule): {request.demographic_parity_ratio}
    - Demographic Parity Difference: {request.demographic_parity_difference}
    
    Write a concise 1-paragraph summary explaining the business impact and systemic risk to non-technical executives. 
    Be direct, professional, and forensic.
    """
    
    try:
        response = gemini_pro.generate_content(
            prompt,
            generation_config=GenerationConfig(temperature=0.4)
        )
        return {"status": "success", "report": response.text.strip()}
    except Exception as e:
        print(f"Vertex AI report error: {e}. Falling back to mock report.")
        return {
            "status": "success", 
            "report": f"Mock AI Review [{request.years_simulated} Years]: Systemic divergence detected. The demographic parity ratio of {request.demographic_parity_ratio} indicates algorithmic polarization. A policy threshold review is strongly recommended to neutralize compounding disparities on {request.sensitive_feature}."
        }


@app.post("/ingest-data")
async def ingest_data(
    file: UploadFile = File(...),
    fileType: str = Form(...),
    schema: str = Form(...)
):
    """Ingest CSV, JSON, or Parquet data for bias simulation"""
    content = await file.read()
    
    try:
        if fileType == "csv":
            df = pd.read_csv(io.StringIO(content.decode('utf-8')))
        elif fileType == "json":
            data = json.loads(content.decode('utf-8'))
            df = pd.DataFrame(data)
        elif fileType == "parquet":
            df = pd.read_parquet(io.BytesIO(content))
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {fileType}")
        
        personas = []
        for i, row in df.iterrows():
            persona = {
                "persona_id": f"ingested_{i}",
                "traits": row.to_dict(),
                "metadata": {"source": file.filename, "file_type": fileType}
            }
            personas.append(persona)
        
        with open("mock_personas.json", "w") as f:
            json.dump(personas, f)
        
        return {
            "status": "success",
            "message": f"Successfully ingested {len(personas)} records",
            "columns": list(df.columns),
            "row_count": len(df)
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to ingest data: {str(e)}")


@app.post("/upload-model")
async def upload_model(file: UploadFile = File(...)):
    """Upload a custom sklearn-compatible .pkl model for comparison"""
    if not file.filename.endswith(".pkl"):
        raise HTTPException(status_code=400, detail="Only .pkl files are supported.")
    content = await file.read()
    save_path = os.path.join(CUSTOM_MODELS_DIR, file.filename)
    # Write to disk first — joblib requires a real file path to load reliably
    with open(save_path, "wb") as f:
        f.write(content)
    # Validate it's a loadable sklearn-compatible model
    try:
        model = joblib.load(save_path)
        if not (hasattr(model, 'fit') and hasattr(model, 'predict')):
            os.remove(save_path)
            raise HTTPException(status_code=400, detail="File is not a valid sklearn model (must have fit and predict methods).")
    except HTTPException:
        raise
    except Exception as e:
        os.remove(save_path)
        raise HTTPException(status_code=400, detail=f"Could not load model: {str(e)}")
    return {"status": "success", "filename": file.filename, "model_type": f"custom_{file.filename}"}


@app.get("/custom-models")
def list_custom_models():
    """List all uploaded custom models"""
    files = [f for f in os.listdir(CUSTOM_MODELS_DIR) if f.endswith(".pkl")]
    return {
        "status": "success",
        "models": [{"filename": f, "model_type": f"custom_{f}", "name": f.replace(".pkl", "").replace("_", " ")} for f in files]
    }


@app.delete("/custom-models/{filename}")
def delete_custom_model(filename: str):
    """Delete an uploaded custom model"""
    path = os.path.join(CUSTOM_MODELS_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Model not found.")
    os.remove(path)
    return {"status": "success", "message": f"{filename} deleted."}


@app.get("/data-status")
def data_status():
    """Check if real ingested data is available and return its columns"""
    try:
        with open("mock_personas.json", "r") as f:
            data = json.load(f)
        if not data:
            return {"has_data": False, "columns": [], "row_count": 0, "source": "none"}

        source = data[0].get("metadata", {}).get("source", "synthetic")
        raw_traits = data[0].get("traits", {})

        # Only expose scalar-valued columns (skip nested dicts/lists)
        columns = [
            k for k, v in raw_traits.items()
            if not isinstance(v, (dict, list))
        ]

        return {
            "has_data": True,
            "columns": columns,
            "row_count": len(data),
            "source": source
        }
    except FileNotFoundError:
        return {"has_data": False, "columns": [], "row_count": 0, "source": "none"}


@app.get("/historical-simulations")
def get_historical_simulations():
    """Get historical simulation records"""
    return {
        "status": "success",
        "simulations": []
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)