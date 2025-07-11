const AdminSettings = require('../models/AdminSettings');

const normalizeIP = (ip = '') =>
  ip.replace('::ffff:', '').replace('::1', '127.0.0.1').trim();

module.exports = async (req, res, next) => {
  try {
    // 1. Extract and normalize client IP
    let rawIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const clientIP = normalizeIP(rawIP);

    console.log(`🔍 Client IP: [${clientIP}]`);

    // 2. Allow localhost during development
    if (clientIP === '127.0.0.1') {
      console.log('🛠 Development IP detected. Skipping restriction.');
      req.networkCheck = { clientIP, ipAllowed: true, deviceAllowed: true };
      return next();
    }

    // 3. Fetch settings from DB
    const settings = await AdminSettings.findOne();
    if (!settings) {
      console.warn('⚠️ No AdminSettings found.');
      return res.status(500).json({ message: 'Admin settings not configured' });
    }

    const allowed_ips_raw = settings.allowed_ips ?? [];
    const allowed_devices_raw = settings.allowed_devices ?? [];

    const allowed_ips = Array.isArray(allowed_ips_raw)
      ? allowed_ips_raw.map(normalizeIP)
      : String(allowed_ips_raw).split(',').map(normalizeIP).filter(Boolean);

    const allowed_devices = Array.isArray(allowed_devices_raw)
      ? allowed_devices_raw.map(normalizeIP)
      : String(allowed_devices_raw).split(',').map(normalizeIP).filter(Boolean);

    const ipAllowed = allowed_ips.includes(clientIP);
    const deviceAllowed = allowed_devices.includes(clientIP);

    req.networkCheck = { clientIP, ipAllowed, deviceAllowed };

    // 4. Restrict access if not allowed
    if (!ipAllowed && !deviceAllowed) {
      console.warn('❌ Blocked IP:', clientIP);
      return res.status(403).json({
        message: 'Access denied. Not on office WiFi or allowed device.',
        clientIP,
        ipAllowed,
        deviceAllowed
      });
    }

    next();
  } catch (err) {
    console.error('❌ IP Check Error:', err);
    res.status(500).json({ message: 'Internal error during IP/device check' });
  }
};
