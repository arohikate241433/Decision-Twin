import requests
import os
import json
import time

BASE_URL = "http://localhost:8000"

def wait_for_server(url=BASE_URL, timeout=30):
    """Wait for the FastAPI server to be reachable."""
    print(f"Waiting for server at {url}...")
    start = time.time()
    while time.time() - start < timeout:
        try:
            r = requests.get(f"{url}/health", timeout=2)
            if r.status_code == 200:
                print(f"Server ready! (took {time.time()-start:.1f}s)")
                return True
        except requests.ConnectionError:
            pass
        time.sleep(1)
    raise RuntimeError(f"Server at {url} not reachable after {timeout}s")

def test_1_cross_domain_ingestion():
    print("--- 1. Testing Cross-Domain Ingestion & Schema Mapping ---")
    mock_data_dir = "mock_data"
    
    # a) Lending Ingestion
    print("Testing Lending Upload...")
    lending_csv = os.path.join(mock_data_dir, "lending_mock.csv")
    lending_model = os.path.join(mock_data_dir, "lending_model.pkl")
    
    with open(lending_csv, "rb") as f_csv, open(lending_model, "rb") as f_model:
        files = {
            "file": ("lending_mock.csv", f_csv, "text/csv"),
            "model_file": ("lending_model.pkl", f_model, "application/octet-stream")
        }
        data = {
            "domain": "lending",
            "protected_attribute": "gender",
            "target_outcome": "approved",
            "use_mock": "false"
        }
        res = requests.post(f"{BASE_URL}/upload-data", files=files, data=data)
        assert res.status_code == 200, f"Lending upload failed: {res.text}"
        res_json = res.json()
        print("Lending Upload Output:", res_json)
        assert "income" in res_json["columns"]
        assert "credit_score" in res_json["columns"]
        assert res_json["status"] == "success"

    # Verify session is updated
    sess_res = requests.get(f"{BASE_URL}/session").json()
    assert sess_res["domain"] == "lending"
    assert sess_res["target_outcome"] == "approved"
    assert sess_res["protected_attribute"] == "gender"
    
    # b) Hiring Ingestion
    print("\nTesting Hiring Upload...")
    hiring_csv = os.path.join(mock_data_dir, "hiring_mock.csv")
    hiring_model = os.path.join(mock_data_dir, "hiring_model.pkl")
    
    with open(hiring_csv, "rb") as f_csv, open(hiring_model, "rb") as f_model:
        files = {
            "file": ("hiring_mock.csv", f_csv, "text/csv"),
            "model_file": ("hiring_model.pkl", f_model, "application/octet-stream")
        }
        data = {
            "domain": "hiring",
            "protected_attribute": "gender",
            "target_outcome": "hired",
            "use_mock": "false"
        }
        res = requests.post(f"{BASE_URL}/upload-data", files=files, data=data)
        assert res.status_code == 200, f"Hiring upload failed: {res.text}"
        res_json = res.json()
        print("Hiring Upload Output:", res_json)
        assert "experience_years" in res_json["columns"] or "years_experience" in res_json["columns"]
        assert "technical_score" in res_json["columns"]
        assert res_json["status"] == "success"

    # Verify session is updated
    sess_res = requests.get(f"{BASE_URL}/session").json()
    assert sess_res["domain"] == "hiring"
    assert sess_res["target_outcome"] == "hired"

    # c) Scholarship Ingestion
    print("\nTesting Scholarship Upload...")
    scholarship_csv = os.path.join(mock_data_dir, "scholarship_mock.csv")
    scholarship_model = os.path.join(mock_data_dir, "scholarship_model.pkl")
    
    with open(scholarship_csv, "rb") as f_csv, open(scholarship_model, "rb") as f_model:
        files = {
            "file": ("scholarship_mock.csv", f_csv, "text/csv"),
            "model_file": ("scholarship_model.pkl", f_model, "application/octet-stream")
        }
        data = {
            "domain": "scholarship",
            "protected_attribute": "rural_urban",
            "target_outcome": "selected",
            "use_mock": "false"
        }
        res = requests.post(f"{BASE_URL}/upload-data", files=files, data=data)
        assert res.status_code == 200, f"Scholarship upload failed: {res.text}"
        res_json = res.json()
        print("Scholarship Upload Output:", res_json)
        assert "rural_urban" in res_json["columns"]
        assert "academic_score" in res_json["columns"]
        assert res_json["status"] == "success"

    # Verify session is updated
    sess_res = requests.get(f"{BASE_URL}/session").json()
    assert sess_res["domain"] == "scholarship"
    assert sess_res["target_outcome"] == "selected"
    assert sess_res["protected_attribute"] == "rural_urban"

    print("=== Cross-Domain Ingestion: PASSED ===\n")

def test_2_agent1_context_adaptation():
    print("--- 2. Testing Agent 1 Persona Generator Context Adaptation ---")
    
    # Set to hiring first
    hiring_csv = os.path.join("mock_data", "hiring_mock.csv")
    hiring_model = os.path.join("mock_data", "hiring_model.pkl")
    with open(hiring_csv, "rb") as f_csv, open(hiring_model, "rb") as f_model:
        requests.post(f"{BASE_URL}/upload-data", files={
            "file": ("hiring_mock.csv", f_csv, "text/csv"),
            "model_file": ("hiring_model.pkl", f_model, "application/octet-stream")
        }, data={
            "domain": "hiring",
            "protected_attribute": "gender",
            "target_outcome": "hired",
            "use_mock": "false"
        })

    # Trigger Agent 1 for hiring
    print("Generating personas for Hiring...")
    req_payload = {
        "persona_count": 5,
        "characteristics": []
    }
    res = requests.post(f"{BASE_URL}/generate-synthetic-data", json=req_payload)
    assert res.status_code == 200, f"Persona generation failed: {res.text}"
    hiring_personas = res.json()["data"]
    print(f"Generated {len(hiring_personas)} hiring personas.")
    for p in hiring_personas:
        traits = p["traits"]
        metadata = p["metadata"]
        print("Persona Sample:", traits)
        print("Metadata:", metadata)
        # Ensure schema match
        assert "years_experience" in traits
        assert "technical_score" in traits
        assert "hired" not in traits

    # Set to lending
    lending_csv = os.path.join("mock_data", "lending_mock.csv")
    lending_model = os.path.join("mock_data", "lending_model.pkl")
    with open(lending_csv, "rb") as f_csv, open(lending_model, "rb") as f_model:
        requests.post(f"{BASE_URL}/upload-data", files={
            "file": ("lending_mock.csv", f_csv, "text/csv"),
            "model_file": ("lending_model.pkl", f_model, "application/octet-stream")
        }, data={
            "domain": "lending",
            "protected_attribute": "gender",
            "target_outcome": "approved",
            "use_mock": "false"
        })

    # Trigger Agent 1 for lending
    print("\nGenerating personas for Lending...")
    res = requests.post(f"{BASE_URL}/generate-synthetic-data", json=req_payload)
    assert res.status_code == 200, f"Persona generation failed: {res.text}"
    lending_personas = res.json()["data"]
    print(f"Generated {len(lending_personas)} lending personas.")
    for p in lending_personas:
        traits = p["traits"]
        metadata = p["metadata"]
        print("Persona Sample:", traits)
        print("Metadata:", metadata)
        assert "credit_score" in traits
        assert "income" in traits
        assert "approved" not in traits

    print("=== Agent 1 Context Adaptation: PASSED ===\n")

def test_3_agent2_dynamic_transition():
    print("--- 3. Testing Agent 2 Simulation Critic Dynamic State Transitions ---")
    
    # 1. Lending Domain
    print("Testing Lending Simulation (3 years)...")
    lending_csv = os.path.join("mock_data", "lending_mock.csv")
    lending_model = os.path.join("mock_data", "lending_model.pkl")
    with open(lending_csv, "rb") as f_csv, open(lending_model, "rb") as f_model:
        requests.post(f"{BASE_URL}/upload-data", files={
            "file": ("lending_mock.csv", f_csv, "text/csv"),
            "model_file": ("lending_model.pkl", f_model, "application/octet-stream")
        }, data={
            "domain": "lending",
            "protected_attribute": "gender",
            "target_outcome": "approved",
            "use_mock": "false"
        })

    sim_res = requests.post(f"{BASE_URL}/run-simulation?years=3&generate_personas=false").json()
    assert "yearly_results" in sim_res
    assert len(sim_res["yearly_results"]) == 3
    
    # Verify state transitions for lending
    # approved = credit score + 15, rejected = credit score - 10
    year1_data = sim_res["yearly_results"][0]["data_snapshot"]
    year2_data = sim_res["yearly_results"][1]["data_snapshot"]
    year1_decisions = sim_res["yearly_results"][0]["decisions"]
    
    for idx, decision in enumerate(year1_decisions):
        y1_score = year1_data[idx]["credit_score"]
        y2_score = year2_data[idx]["credit_score"]
        if decision == 1:
            expected = min(850, y1_score + 15)
            assert y2_score == expected, f"Lending state transition failed for index {idx} on approval: {y1_score} -> {y2_score}"
        else:
            expected = max(300, y1_score - 10)
            assert y2_score == expected, f"Lending state transition failed for index {idx} on rejection: {y1_score} -> {y2_score}"

    print("Lending State Transitions verified successfully.")

    # 2. Hiring Domain
    print("\nTesting Hiring Simulation (3 years)...")
    hiring_csv = os.path.join("mock_data", "hiring_mock.csv")
    hiring_model = os.path.join("mock_data", "hiring_model.pkl")
    with open(hiring_csv, "rb") as f_csv, open(hiring_model, "rb") as f_model:
        requests.post(f"{BASE_URL}/upload-data", files={
            "file": ("hiring_mock.csv", f_csv, "text/csv"),
            "model_file": ("hiring_model.pkl", f_model, "application/octet-stream")
        }, data={
            "domain": "hiring",
            "protected_attribute": "gender",
            "target_outcome": "hired",
            "use_mock": "false"
        })

    sim_res_hiring = requests.post(f"{BASE_URL}/run-simulation?years=3&generate_personas=false").json()
    assert len(sim_res_hiring["yearly_results"]) == 3
    
    # Verify state transitions for hiring
    # approved = years_experience + 1, rejected = years_experience + 0.1
    year1_data = sim_res_hiring["yearly_results"][0]["data_snapshot"]
    year2_data = sim_res_hiring["yearly_results"][1]["data_snapshot"]
    year1_decisions = sim_res_hiring["yearly_results"][0]["decisions"]
    
    for idx, decision in enumerate(year1_decisions):
        y1_exp = year1_data[idx]["years_experience"]
        y2_exp = year2_data[idx]["years_experience"]
        if decision == 1:
            expected = y1_exp + 1
            assert abs(y2_exp - expected) < 1e-5, f"Hiring transition failed for index {idx} approval"
        else:
            expected = y1_exp + 0.1
            assert abs(y2_exp - expected) < 1e-5, f"Hiring transition failed for index {idx} rejection"

    # Confirm Fairlearn metrics are present and correct format
    metrics = sim_res_hiring["yearly_results"][0]["metrics"]
    print("Fairness Metrics returned:", metrics)
    assert "demographic_parity_ratio" in metrics
    assert "demographic_parity_diff" in metrics
    assert "disparate_impact" in metrics
    
    print("=== Agent 2 Dynamic Transitions & Metrics: PASSED ===\n")

def test_4_agent3_regulatory_shift():
    print("--- 4. Testing Agent 3 Compliance Auditor Regulatory Shift ---")
    
    # Lending
    print("Checking Regulatory Shift for Lending...")
    lending_csv = os.path.join("mock_data", "lending_mock.csv")
    lending_model = os.path.join("mock_data", "lending_model.pkl")
    with open(lending_csv, "rb") as f_csv, open(lending_model, "rb") as f_model:
        requests.post(f"{BASE_URL}/upload-data", files={
            "file": ("lending_mock.csv", f_csv, "text/csv"),
            "model_file": ("lending_model.pkl", f_model, "application/octet-stream")
        }, data={
            "domain": "lending",
            "protected_attribute": "gender",
            "target_outcome": "approved",
            "use_mock": "false"
        })
    requests.post(f"{BASE_URL}/run-simulation?years=3&generate_personas=false")
    report_lending = requests.post(f"{BASE_URL}/generate-report").json()["report"]
    print("Lending Audit Report Snippet:")
    print("\n".join(report_lending.split("\n")[:15]))
    assert "RBI" in report_lending or "lending" in report_lending.lower()

    # Hiring
    print("\nChecking Regulatory Shift for Hiring...")
    hiring_csv = os.path.join("mock_data", "hiring_mock.csv")
    hiring_model = os.path.join("mock_data", "hiring_model.pkl")
    with open(hiring_csv, "rb") as f_csv, open(hiring_model, "rb") as f_model:
        requests.post(f"{BASE_URL}/upload-data", files={
            "file": ("hiring_mock.csv", f_csv, "text/csv"),
            "model_file": ("hiring_model.pkl", f_model, "application/octet-stream")
        }, data={
            "domain": "hiring",
            "protected_attribute": "gender",
            "target_outcome": "hired",
            "use_mock": "false"
        })
    requests.post(f"{BASE_URL}/run-simulation?years=3&generate_personas=false")
    report_hiring = requests.post(f"{BASE_URL}/generate-report").json()["report"]
    print("Hiring Audit Report Snippet:")
    print("\n".join(report_hiring.split("\n")[:15]))
    # For hiring, we expect compliance to shift or at least be about employment/labor D&I context
    assert "HIRING" in report_hiring or "hiring" in report_hiring.lower() or "employment" in report_hiring.lower()

    print("=== Agent 3 Regulatory Shift: PASSED ===\n")

if __name__ == "__main__":
    wait_for_server()
    test_1_cross_domain_ingestion()
    test_2_agent1_context_adaptation()
    test_3_agent2_dynamic_transition()
    test_4_agent3_regulatory_shift()
    print("ALL BACKEND INTEGRATION TESTS PASSED SUCCESSFULLY!")
