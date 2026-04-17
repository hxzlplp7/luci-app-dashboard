function createSectionState(expanded) {
  return {
    expanded,
    loaded: false,
    loading: false,
    error: null,
  };
}

export function buildSectionState() {
  return {
    overview: createSectionState(true),
    users: createSectionState(false),
    network: createSectionState(false),
    system: createSectionState(false),
    record: createSectionState(false),
    feature: createSectionState(false),
    settings: createSectionState(false),
  };
}
