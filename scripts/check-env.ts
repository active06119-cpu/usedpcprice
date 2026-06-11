import "dotenv/config";

const required = ["DATABASE_URL", "NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET"] as const;

for (const key of required) {
  const value = process.env[key];
  const present = value && value.trim().length > 0;
  console.log(`${key}: ${present ? "SET" : "MISSING"}`);
}
