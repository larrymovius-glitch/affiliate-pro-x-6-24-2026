export const metricOptions = [
  { value: "epc", label: "EPC" },
  { value: "conversion_rate", label: "Conversion rate" },
  { value: "clicks", label: "Clicks" },
  { value: "earnings", label: "Earnings" },
];

export const actionOptions = [
  { value: "promote_winner", label: "Promote winning ad" },
  { value: "pause_loser", label: "Pause weak ad" },
  { value: "create_variants", label: "Create new variants" },
  { value: "send_alert", label: "Send alert" },
];

export function labelFor(options, value) {
  return options.find((option) => option.value === value)?.label || value;
}