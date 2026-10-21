/** The calibration table was fitted on Laya's probabilities; TypeSafe's hosted Jev (`jev-*`) is a different model, so its probabilities stay as they are. */
export const usesLayaCalibration = (model: string) => !model.startsWith("jev");
