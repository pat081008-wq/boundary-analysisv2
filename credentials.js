// ═══════════════════════════════════════════════════════════
//  Geocore Analytics — User Credentials
// ═══════════════════════════════════════════════════════════
//  Edit the USERS object below to manage access.
//
//  Format:   "username": "password"
//  Usernames are NOT case-sensitive
//  Passwords ARE case-sensitive and support any characters
// ═══════════════════════════════════════════════════════════

const USERS = {
  "admin":            "geocore2024",
  "Patrick Richards": "rT4*U5xMmX",
  "Dean Richards":    "gF^s$%p3mV"
};

// ── Do not modify below this line ──
function checkCredentials(username, password) {
  const key = Object.keys(USERS).find(
    k => k.toLowerCase() === username.toLowerCase().trim()
  );
  return key !== undefined && USERS[key] === password;
}
