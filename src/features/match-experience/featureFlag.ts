export function isMatchExperienceV2Enabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_MATCH_EXPERIENCE_V2 === "true";
}

