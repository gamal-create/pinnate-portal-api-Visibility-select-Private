// ============================================================
//  PINNATE CONSULTING — AZURE FUNCTION BACKEND
//  Handles: login, addUser, updateUser, removeUser, getUsers
//  Deploy this file into your Azure Function App
// ============================================================

const { CosmosClient } = require('@azure/cosmos');

const client     = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const database   = client.database('PinnatePortal');
const container  = database.container('Users');

// CORS headers — allow the portal to call this API from any origin
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type':                 'application/json'
};

// ── Admin credentials — hardcoded, never stored in database ──
const ADMIN = {
  userid:   'gamal',
  password: 'Pinnate@Admin2025!',
  name:     'Gamal',
  company:  'Pinnate Consulting LLC',
  role:     'admin'
};

module.exports = async function (context, req) {

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    context.res = { status: 200, headers: CORS, body: '' };
    return;
  }

  try {
    const body   = req.body || {};
    const action = body.action || req.query.action || '';

    // ── LOGIN ────────────────────────────────────────────────────
    if (action === 'login') {
      const uid = (body.userid || '').trim().toLowerCase();
      const pw  = (body.password || '').trim();

      if (!uid || !pw) {
        context.res = { status: 400, headers: CORS, body: JSON.stringify({ status: 'error', message: 'Missing credentials' }) };
        return;
      }

      // Admin check
      if (uid === ADMIN.userid && pw === ADMIN.password) {
        context.res = { status: 200, headers: CORS, body: JSON.stringify({
          status: 'ok',
          user: { userid: ADMIN.userid, name: ADMIN.name, company: ADMIN.company, role: 'admin' }
        })};
        return;
      }

      // Database user check
      const { resource } = await container.item(uid, uid).read().catch(() => ({ resource: null }));
      if (!resource) {
        context.res = { status: 401, headers: CORS, body: JSON.stringify({ status: 'error', message: 'Invalid credentials' }) };
        return;
      }
      if (resource.suspended) {
        context.res = { status: 403, headers: CORS, body: JSON.stringify({ status: 'error', message: 'Account suspended' }) };
        return;
      }
      if (resource.password !== pw) {
        context.res = { status: 401, headers: CORS, body: JSON.stringify({ status: 'error', message: 'Invalid credentials' }) };
        return;
      }

      context.res = { status: 200, headers: CORS, body: JSON.stringify({
        status: 'ok',
        user: { userid: resource.userid, name: resource.name, company: resource.company, role: resource.role || 'user' }
      })};
      return;
    }

    // ── GET ALL USERS (admin only) ───────────────────────────────
    if (action === 'getUsers') {
      const { resources } = await container.items.query('SELECT * FROM c').fetchAll();
      context.res = { status: 200, headers: CORS, body: JSON.stringify({ status: 'ok', users: resources }) };
      return;
    }

    // ── ADD USER ─────────────────────────────────────────────────
    if (action === 'addUser') {
      const uid = (body.userid || '').trim().toLowerCase();
      if (!uid) {
        context.res = { status: 400, headers: CORS, body: JSON.stringify({ status: 'error', message: 'Missing userid' }) };
        return;
      }
      const userDoc = {
        id:        uid,
        userid:    uid,
        password:  body.password  || '',
        name:      body.name      || '',
        company:   body.company   || '',
        role:      body.role      || 'user',
        suspended: false,
        createdAt: new Date().toISOString()
      };
      await container.items.upsert(userDoc);
      context.res = { status: 200, headers: CORS, body: JSON.stringify({ status: 'ok', message: 'User added: ' + uid }) };
      return;
    }

    // ── UPDATE USER FIELD ────────────────────────────────────────
    if (action === 'updateUser') {
      const uid   = (body.userid || '').trim().toLowerCase();
      const field = body.field;
      let   value = body.value;
      if (!uid || !field) {
        context.res = { status: 400, headers: CORS, body: JSON.stringify({ status: 'error', message: 'Missing userid or field' }) };
        return;
      }
      const { resource } = await container.item(uid, uid).read().catch(() => ({ resource: null }));
      if (!resource) {
        context.res = { status: 404, headers: CORS, body: JSON.stringify({ status: 'error', message: 'User not found: ' + uid }) };
        return;
      }
      if (field === 'suspended') value = (value === 'true' || value === true);
      resource[field] = value;
      await container.items.upsert(resource);
      context.res = { status: 200, headers: CORS, body: JSON.stringify({ status: 'ok', message: 'Updated ' + field + ' for ' + uid }) };
      return;
    }

    // ── REMOVE USER ──────────────────────────────────────────────
    if (action === 'removeUser') {
      const uid = (body.userid || '').trim().toLowerCase();
      if (!uid) {
        context.res = { status: 400, headers: CORS, body: JSON.stringify({ status: 'error', message: 'Missing userid' }) };
        return;
      }
      await container.item(uid, uid).delete().catch(() => {});
      context.res = { status: 200, headers: CORS, body: JSON.stringify({ status: 'ok', message: 'Removed user: ' + uid }) };
      return;
    }

    // ── UNKNOWN ACTION ───────────────────────────────────────────
    context.res = { status: 400, headers: CORS, body: JSON.stringify({ status: 'error', message: 'Unknown action: ' + action }) };

  } catch (err) {
    context.res = { status: 500, headers: CORS, body: JSON.stringify({ status: 'error', message: err.message }) };
  }
};
