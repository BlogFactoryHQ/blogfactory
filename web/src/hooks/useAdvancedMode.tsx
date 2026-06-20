import { useState, useEffect, useCallback } from "react";

const ADVANCED_MODE_KEY = "persona-advanced-mode";

export function useAdvancedMode() {
  const [isAdvanced, setIsAdvanced] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(ADVANCED_MODE_KEY);
      return stored === "true";
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem(ADVANCED_MODE_KEY, String(isAdvanced));
  }, [isAdvanced]);

  const toggleAdvanced = useCallback(() => {
    setIsAdvanced((prev) => !prev);
  }, []);

  return { isAdvanced, setIsAdvanced, toggleAdvanced };
}
