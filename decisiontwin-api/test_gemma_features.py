import unittest

from agents.simulation_critic import SimulationCritic


class GemmaFeatureTests(unittest.TestCase):
    def test_generate_adjustment_suggestion_falls_back(self):
        critic = SimulationCritic()
        critic.ollama_url = "http://localhost:9999/invalid" # Ensure fallback
        critic.use_vertex = False

        results = {
            "yearly_results": [
                {
                    "year": 1,
                    "metrics": {
                        "demographic_parity_ratio": 0.61,
                        "disparate_impact": 0.48,
                        "demographic_parity_diff": 0.22,
                    },
                    "average_target_rate": 0.83,
                }
            ],
            "gemma_critique": "Bias drift is present.",
        }

        suggestion = critic.generate_adjustment_suggestion(results, "lending", "gender")

        self.assertIsInstance(suggestion, dict)
        self.assertIn("suggestion", suggestion)
        self.assertIn("expected_bias_reduction_pct", suggestion)
        self.assertGreaterEqual(suggestion["expected_bias_reduction_pct"], 0)

    def test_generate_compliance_scorecard_falls_back(self):
        critic = SimulationCritic()
        critic.ollama_url = "http://localhost:9999/invalid" # Ensure fallback
        critic.use_vertex = False

        results = {
            "yearly_results": [
                {
                    "year": 1,
                    "metrics": {
                        "demographic_parity_ratio": 0.72,
                        "disparate_impact": 0.65,
                        "demographic_parity_diff": 0.21,
                    },
                    "average_target_rate": 0.76,
                }
            ]
        }

        scorecard = critic.generate_compliance_scorecard(results, "lending", "gender")

        self.assertIsInstance(scorecard, dict)
        self.assertIn("score", scorecard)
        self.assertIn("status", scorecard)
        self.assertIn("reasons", scorecard)
        self.assertIn("legal_note", scorecard)
        self.assertGreaterEqual(scorecard["score"], 0)
        self.assertLessEqual(scorecard["score"], 100)
        # Ensure fallback note includes the dynamic metrics
        self.assertIn("fairness ratio of 0.72", scorecard["legal_note"])
        self.assertIn("disparate impact of 0.65", scorecard["legal_note"])

if __name__ == "__main__":
    unittest.main()
