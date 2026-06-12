# Graph Report - Solution Challange 2026  (2026-06-13)

## Corpus Check
- 25 files · ~23,230 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 154 nodes · 191 edges · 12 communities detected
- Extraction: 71% EXTRACTED · 29% INFERRED · 0% AMBIGUOUS · INFERRED: 56 edges (avg confidence: 0.69)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]

## God Nodes (most connected - your core abstractions)
1. `SimulationCritic` - 17 edges
2. `DecisionTwin High-Level Architecture & Tech Stack` - 16 edges
3. `ComplianceAuditor` - 13 edges
4. `PersonaGenerator` - 13 edges
5. `DecisionTwin Product Requirements Document` - 13 edges
6. `DecisionTwin Comprehensive System Overview` - 10 edges
7. `DecisionTwin Current Working Features & Tech Stack` - 9 edges
8. `DecisionTwin Visual Identity & UI/UX Style Guide` - 8 edges
9. `main()` - 5 edges
10. `SyntheticDataRequest` - 5 edges

## Surprising Connections (you probably didn't know these)
- `SyntheticDataRequest` --uses--> `SimulationCritic`  [INFERRED]
  decisiontwin-api\main.py → decisiontwin-api\agents\simulation_critic.py
- `OverrideRequest` --uses--> `SimulationCritic`  [INFERRED]
  decisiontwin-api\main.py → decisiontwin-api\agents\simulation_critic.py
- `Returns the current session state metadata` --uses--> `SimulationCritic`  [INFERRED]
  decisiontwin-api\main.py → decisiontwin-api\agents\simulation_critic.py
- `Ingests CSV dataset and custom .pkl / .onnx models.     Supports using pre-train` --uses--> `SimulationCritic`  [INFERRED]
  decisiontwin-api\main.py → decisiontwin-api\agents\simulation_critic.py
- `Generates standalone synthetic personas based on the active dataset schema.` --uses--> `SimulationCritic`  [INFERRED]
  decisiontwin-api\main.py → decisiontwin-api\agents\simulation_critic.py

## Hyperedges (group relationships)
- **Bias Detection ML Pipeline** — decisiontwin_architecture_fairlearn, decisiontwin_architecture_scikit_learn, decisiontwin_architecture_pandas [INFERRED 0.90]
- **Google Cloud Platform Infrastructure Stack** — decisiontwin_architecture_gemini_pro, decisiontwin_architecture_cloud_run, decisiontwin_architecture_firebase_hosting [INFERRED 0.85]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.11
Nodes (20): BaseModel, ComplianceAuditor, Ingests the simulation results, including demographics parity curves and Gemma's, generate_report(), generate_synthetic_data(), get_historical_simulations(), get_session(), OverrideRequest (+12 more)

### Community 1 - "Community 1"
Cohesion: 0.1
Nodes (30): Dark Mode Design System, Diverging Area Charts for Bias Visualization, DecisionTwin Visual Identity & UI/UX Style Guide, Framer Motion, Glassmorphism Card Design, Semantic Ethics Color Palette, Baseline Fairness Dashboard, DecisionTwin Complete User Journey & Logic Flow (+22 more)

### Community 2 - "Community 2"
Cohesion: 0.13
Nodes (19): Gemini Forensic Audit Report Generation, Google Cloud Run, DecisionTwin High-Level Architecture & Tech Stack, FastAPI, Firebase Hosting, Vertex AI Gemini 1.5 Pro, Next.js, TanStack React Query (+11 more)

### Community 3 - "Community 3"
Cohesion: 0.16
Nodes (9): override_decision(), Applies a human-in-the-loop override for a borderline case at a specific year., Applies mathematical state transitions based on decisions:         - Lending: ap, Calculates demographic parity ratio, difference, and disparate impact ratio., Runs the multi-year longitudinal simulation.         Applies decisions, HITL ove, Queries Gemma 2 using Vertex AI or Ollama Local API., Loads a model (.pkl or .onnx)., Performs model inference, automatically handling pipeline, sklearn models, or ON (+1 more)

### Community 4 - "Community 4"
Cohesion: 0.29
Nodes (2): Wait for the FastAPI server to be reachable., wait_for_server()

### Community 5 - "Community 5"
Cohesion: 0.6
Nodes (5): create_hiring_data(), create_lending_data(), create_scholarship_data(), main(), train_and_save_model()

### Community 6 - "Community 6"
Cohesion: 0.33
Nodes (6): Time-Travel Slider, Fairlearn, Scikit-learn, Rationale: Why Fairlearn, 80% Rule / Disparate Impact Threshold, Bias Simulation Engine Endpoint

### Community 26 - "Community 26"
Cohesion: 1.0
Nodes (1): Recharts

### Community 27 - "Community 27"
Cohesion: 1.0
Nodes (1): Tailwind CSS

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (1): Shadcn/UI

### Community 29 - "Community 29"
Cohesion: 1.0
Nodes (1): Docker

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (1): Pandas

## Knowledge Gaps
- **30 isolated node(s):** `Wait for the FastAPI server to be reachable.`, `Ingests the simulation results, including demographics parity curves and Gemma's`, `Ingests the base dataframe, analyzes schema and values, and generates         di`, `Fallback mock generator using simple random variations of the base dataset`, `Queries Gemma 2 using Vertex AI or Ollama Local API.` (+25 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 4`** (7 nodes): `test_domain_agnostic.py`, `Wait for the FastAPI server to be reachable.`, `test_1_cross_domain_ingestion()`, `test_2_agent1_context_adaptation()`, `test_3_agent2_dynamic_transition()`, `test_4_agent3_regulatory_shift()`, `wait_for_server()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (1 nodes): `Recharts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (1 nodes): `Tailwind CSS`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (1 nodes): `Shadcn/UI`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (1 nodes): `Docker`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (1 nodes): `Pandas`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DecisionTwin High-Level Architecture & Tech Stack` connect `Community 2` to `Community 1`, `Community 6`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Why does `SimulationCritic` connect `Community 3` to `Community 0`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Why does `DecisionTwin Product Requirements Document` connect `Community 1` to `Community 2`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Are the 9 inferred relationships involving `SimulationCritic` (e.g. with `SyntheticDataRequest` and `OverrideRequest`) actually correct?**
  _`SimulationCritic` has 9 INFERRED edges - model-reasoned connections that need verification._
- **Are the 9 inferred relationships involving `ComplianceAuditor` (e.g. with `SyntheticDataRequest` and `OverrideRequest`) actually correct?**
  _`ComplianceAuditor` has 9 INFERRED edges - model-reasoned connections that need verification._
- **Are the 9 inferred relationships involving `PersonaGenerator` (e.g. with `SyntheticDataRequest` and `OverrideRequest`) actually correct?**
  _`PersonaGenerator` has 9 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `DecisionTwin Product Requirements Document` (e.g. with `DecisionTwin 48-Hour Implementation Plan` and `DecisionTwin Comprehensive System Overview`) actually correct?**
  _`DecisionTwin Product Requirements Document` has 2 INFERRED edges - model-reasoned connections that need verification._