/** The calibration table was fitted on Laya's probabilities; any other decision model (Jev, d1, pplx-decider…) keeps its probabilities as they are. */
export const usesLayaCalibration = (model: string) => model.startsWith("laya");
