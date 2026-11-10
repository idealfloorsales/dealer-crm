const ONLINE_WINDOW_MS = 120000;
function employeePresence(user, now = Date.now()) {
    const seen = user.lastSeenAt ? new Date(user.lastSeenAt).getTime() : NaN;
    return {
        isOnline: !user.isBlocked && Number.isFinite(seen) && seen <= now + 5000 && now - seen <= ONLINE_WINDOW_MS,
        lastSeenAt: user.lastSeenAt || user.lastLoginAt || null
    };
}
module.exports = { employeePresence, ONLINE_WINDOW_MS };
