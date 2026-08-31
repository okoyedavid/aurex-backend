export const isEffectiveAt = (
  effectiveFrom: Date | null | undefined,
  effectiveTo: Date | null | undefined,
  asOf: Date,
) =>
  (!effectiveFrom || effectiveFrom <= asOf) &&
  (!effectiveTo || effectiveTo > asOf);
