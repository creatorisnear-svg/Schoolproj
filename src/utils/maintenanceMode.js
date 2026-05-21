let _active = false;
let _since = null;

export function isMaintenanceMode() {
  return _active;
}

export function setMaintenanceMode(val) {
  _active = !!val;
  _since = _active ? new Date() : null;
}

export function getMaintenanceStatus() {
  return { active: _active, since: _since };
}
