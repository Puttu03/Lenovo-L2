import pandas as pd
import numpy as np
import joblib
import os

from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split, RandomizedSearchCV
from scipy.stats import randint, uniform


class WearoutPredictor:
    def __init__(self, model_path="models/wearout_model.pkl"):
        self.model_path = model_path
        self.model = None

        self.FEATURES = [
            "Power_On_Hours",
            "Total_TBW_TB",
            "Total_TBR_TB",
            "Temperature_C",
            "Percent_Life_Used",
            "Media_Errors",
            "Unsafe_Shutdowns",
            "CRC_Errors",
            "Read_Error_Rate",
            "Write_Error_Rate"
        ]

        self.load_model()

    def load_model(self):
        """Load pre-trained model if exists"""
        if os.path.exists(self.model_path):
            try:
                self.model = joblib.load(self.model_path)
                print(f"[WearoutPredictor] Loaded model from {self.model_path}")
            except Exception as e:
                print(f"[WearoutPredictor] Failed to load model: {e}")
                self.model = None

    def save_model(self):
        """Save model to disk"""
        if self.model:
            os.makedirs(os.path.dirname(self.model_path), exist_ok=True)
            joblib.dump(self.model, self.model_path)
            print(f"[WearoutPredictor] Saved model to {self.model_path}")

    def train_model(self, data_path='data/Clean_Final_NVMe_Dataset.csv'):
        """Train Wear-Out Model (Failure_Mode 0 vs 1)"""
        print("[WearoutPredictor] Training Wear-Out model...")

        df = pd.read_csv(data_path)

        # Filter only 0 and 1
        df = df[df["Failure_Mode"].isin([0, 1])].copy()

        if df.empty:
            raise ValueError("Dataset is empty after filtering Failure_Mode 0 vs 1")

        # Fill missing
        df[self.FEATURES] = df[self.FEATURES].fillna(0)

        X = df[self.FEATURES]
        y = df["Failure_Mode"]

        X_train, X_test, y_train, y_test = train_test_split(
            X, y,
            test_size=0.2,
            stratify=y,
            random_state=5
        )

        # Handle imbalance
        neg = y_train.value_counts().get(0, 0)
        pos = y_train.value_counts().get(1, 0)

        if pos == 0:
            raise ValueError("No class 1 samples found after filtering dataset!")

        scale_pos_weight = neg / pos

        # Base model
        xgb_model = XGBClassifier(
            objective="binary:logistic",
            eval_metric="logloss",
            scale_pos_weight=scale_pos_weight,
            random_state=5,
            use_label_encoder=False
        )

        # Better hyperparameter space
        param_grid = {
            "n_estimators": randint(100, 1500),
            "max_depth": randint(2, 15),
            "learning_rate": uniform(0.01, 0.3),
            "subsample": uniform(0.5, 0.5),
            "colsample_bytree": uniform(0.5, 0.5),
            "gamma": uniform(0, 5),
            "reg_lambda": uniform(0.1, 20),
            "reg_alpha": uniform(0, 10),
            "min_child_weight": randint(1, 15)
        }

        search = RandomizedSearchCV(
            estimator=xgb_model,
            param_distributions=param_grid,
            n_iter=200,
            scoring="f1",
            cv=5,
            verbose=2,
            n_jobs=-1,
            random_state=5
        )

        search.fit(X_train, y_train)

        self.model = search.best_estimator_
        self.model.fit(X_train, y_train)

        self.save_model()

        accuracy = self.model.score(X_test, y_test)

        return {
            "status": "success",
            "accuracy": float(accuracy),
            "best_params": search.best_params_,
            "best_cv_score": float(search.best_score_)
        }

    def predict(self, input_df):
        """Predict wear-out probability"""
        if self.model is None:
            return {
                "risk_percentage": 0.0,
                "contributions": {},
                "status": "Model not trained"
            }

        input_df = input_df.copy()

        # Ensure all features exist
        for f in self.FEATURES:
            if f not in input_df.columns:
                input_df[f] = 0

        input_df[self.FEATURES] = input_df[self.FEATURES].fillna(0)

        proba = self.model.predict_proba(input_df[self.FEATURES])[0][1]
        risk_percentage = proba * 100

        contributions = self.feature_contribution_percentage(input_df)

        return {
            "risk_percentage": float(risk_percentage),
            "contributions": contributions,
            "status": "High Risk" if risk_percentage > 50 else "Normal"
        }

    def feature_contribution_percentage(self, input_df, target_class=1, delta=0.05):
        """
        FIXED contribution logic:
        1) Uses XGBoost feature_importances_ (gain-based)
        2) Uses perturbation fallback if importance is too flat
        """

        input_df = input_df.copy()

        for f in self.FEATURES:
            if f not in input_df.columns:
                input_df[f] = 0

        input_df[self.FEATURES] = input_df[self.FEATURES].fillna(0)

        # ---------------------------
        # 1) XGBoost built-in importance
        # ---------------------------
        raw_importance = self.model.feature_importances_
        gain_dict = dict(zip(self.FEATURES, raw_importance))

        total_gain = sum(gain_dict.values())

        if total_gain > 0:
            gain_percent = {
                f: float((gain_dict[f] / total_gain) * 100)
                for f in self.FEATURES
            }

            # If model is confident but importance is not flat -> return it
            if max(gain_percent.values()) > 5:
                return dict(sorted(gain_percent.items(), key=lambda x: x[1], reverse=True))

        # ---------------------------
        # 2) Perturbation fallback (improved)
        # ---------------------------
        base_proba = self.model.predict_proba(input_df[self.FEATURES])[0]
        class_index = list(self.model.classes_).index(target_class)
        base_value = base_proba[class_index]

        contributions = {}

        for feature in self.FEATURES:
            modified = input_df.copy()

            value = float(modified[feature].values[0])
            change = delta * (abs(value) + 1.0)

            modified[feature] = value + change

            new_proba = self.model.predict_proba(modified[self.FEATURES])[0][class_index]
            impact = abs(new_proba - base_value)

            contributions[feature] = float(impact)

        total_impact = sum(contributions.values())

        if total_impact == 0:
            return {f: 0.0 for f in self.FEATURES}

        percent = {
            f: float((contributions[f] / total_impact) * 100)
            for f in self.FEATURES
        }

        return dict(sorted(percent.items(), key=lambda x: x[1], reverse=True))
