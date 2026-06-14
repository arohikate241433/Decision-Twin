import pandas as pd
from agents.simulation_critic import SimulationCritic

critic = SimulationCritic()

df = pd.read_csv("mock_data/hiring_mock.csv")
model = critic.load_model("mock_data/hiring_model.pkl")

res = critic.run_doppelganger_audit(df, model, "gender", "hired")

print("Flip Rate:", res["flip_rate_percentage"])
print("Sample Flips:", len(res["flipped_cases_sample"]))
if res["flipped_cases_sample"]:
    print(res["flipped_cases_sample"][0])
print("SUCCESS")
