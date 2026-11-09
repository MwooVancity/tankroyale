// One round clock for the sim (timeout = draw) and the HUD countdown, so an
// online host and its guests always agree. 7 min (was 15): phone sessions
// are short (audit C14). VITE_QA_ROUND_S: test builds only.
export const BATTLE_TIME_LIMIT_S = Number(import.meta.env?.VITE_QA_ROUND_S) || 420;
