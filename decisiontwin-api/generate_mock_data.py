import os
import pandas as pd
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
import joblib

def create_lending_data():
    np.random.seed(42)
    n_samples = 200
    
    # Features
    gender = np.random.choice(["Male", "Female"], size=n_samples, p=[0.5, 0.5])
    race = np.random.choice(["White", "Black", "Asian", "Hispanic"], size=n_samples, p=[0.6, 0.15, 0.15, 0.10])
    income = np.random.randint(30000, 150000, size=n_samples)
    credit_score = np.random.randint(500, 850, size=n_samples)
    zip_code = np.random.choice(["10001", "10002", "10003", "10004", "10005"], size=n_samples)
    
    # Introduce bias in outcomes based on credit score, income, and slightly gender/race (to show bias)
    # Target probability
    prob = 1 / (1 + np.exp(-(
        0.00004 * income + 
        0.02 * (credit_score - 650) + 
        np.where(zip_code == "10001", 0.2, -0.1) +
        np.where(gender == "Male", 0.5, -0.5) -
        np.where(race == "Black", 0.4, 0.0)
    )))
    approved = np.random.binomial(1, prob)
    
    df = pd.DataFrame({
        "gender": gender,
        "race": race,
        "income": income,
        "credit_score": credit_score,
        "zip_code": zip_code,
        "approved": approved
    })
    
    return df

def create_scholarship_data():
    np.random.seed(42)
    n_samples = 200
    
    # Features
    rural_urban = np.random.choice(["Rural", "Urban"], size=n_samples, p=[0.4, 0.6])
    gender = np.random.choice(["Male", "Female"], size=n_samples, p=[0.5, 0.5])
    academic_score = np.random.randint(50, 100, size=n_samples)
    family_income = np.random.randint(10000, 120000, size=n_samples)
    
    # Urban and higher income tend to have higher selected rates due to systemic factors
    prob = 1 / (1 + np.exp(-(
        0.15 * (academic_score - 75) + 
        0.00003 * family_income + 
        np.where(rural_urban == "Urban", 0.8, -0.8) +
        np.where(gender == "Female", 0.2, -0.2)
    )))
    selected = np.random.binomial(1, prob)
    
    df = pd.DataFrame({
        "rural_urban": rural_urban,
        "gender": gender,
        "academic_score": academic_score,
        "family_income": family_income,
        "selected": selected
    })
    
    return df

def create_hiring_data():
    np.random.seed(42)
    n_samples = 200
    
    # Features
    gender = np.random.choice(["Male", "Female"], size=n_samples, p=[0.5, 0.5])
    years_experience = np.random.randint(0, 20, size=n_samples)
    technical_score = np.random.randint(40, 100, size=n_samples)
    education_level = np.random.choice(["Bachelors", "Masters", "PhD"], size=n_samples, p=[0.7, 0.2, 0.1])
    
    # Male features tend to correlate higher selected rates due to historic training data bias
    prob = 1 / (1 + np.exp(-(
        0.3 * years_experience + 
        0.1 * (technical_score - 70) + 
        np.where(gender == "Male", 1.0, -1.0) +
        np.where(education_level == "PhD", 0.5, 0.0)
    )))
    hired = np.random.binomial(1, prob)
    
    df = pd.DataFrame({
        "gender": gender,
        "years_experience": years_experience,
        "technical_score": technical_score,
        "education_level": education_level,
        "hired": hired
    })
    
    return df

def train_and_save_model(df, target_col, categorical_cols, model_path):
    X = df.drop(columns=[target_col])
    y = df[target_col]
    
    preprocessor = ColumnTransformer(
        transformers=[
            ('cat', OneHotEncoder(handle_unknown='ignore'), categorical_cols)
        ],
        remainder='passthrough'
    )
    
    model = Pipeline(steps=[
        ('preprocessor', preprocessor),
        ('classifier', LogisticRegression(max_iter=1000))
    ])
    
    model.fit(X, y)
    joblib.dump(model, model_path)
    print(f"Model saved to {model_path}")

def main():
    mock_dir = "mock_data"
    os.makedirs(mock_dir, exist_ok=True)
    
    # 1. Lending
    lending_df = create_lending_data()
    lending_df.to_csv(os.path.join(mock_dir, "lending_mock.csv"), index=False)
    train_and_save_model(
        lending_df, 
        target_col="approved", 
        categorical_cols=["gender", "race", "zip_code"], 
        model_path=os.path.join(mock_dir, "lending_model.pkl")
    )
    
    # 2. Scholarship
    scholarship_df = create_scholarship_data()
    scholarship_df.to_csv(os.path.join(mock_dir, "scholarship_mock.csv"), index=False)
    train_and_save_model(
        scholarship_df, 
        target_col="selected", 
        categorical_cols=["rural_urban", "gender"], 
        model_path=os.path.join(mock_dir, "scholarship_model.pkl")
    )
    
    # 3. Hiring
    hiring_df = create_hiring_data()
    hiring_df.to_csv(os.path.join(mock_dir, "hiring_mock.csv"), index=False)
    train_and_save_model(
        hiring_df, 
        target_col="hired", 
        categorical_cols=["gender", "education_level"], 
        model_path=os.path.join(mock_dir, "hiring_model.pkl")
    )

if __name__ == "__main__":
    main()
