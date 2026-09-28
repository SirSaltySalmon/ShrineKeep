import nextVitals from "eslint-config-next/core-web-vitals"

const eslintConfig = [
  { ignores: [".agents/**", ".claude/**"] },
  ...nextVitals,
]

export default eslintConfig
