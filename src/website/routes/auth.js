import { Router } from 'express';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { randomBytes } from 'crypto';
import axios from 'axios';

export function createAuthRouter() {
  const router = Router();

  router.get('/login', (req, res) => {
    const domain = process.env.DOMAIN || 'severe-daryl-officialplaystation5-0f1738f5.koyeb.app';
    const cleanDomain = domain.toLowerCase().trim().replace(/^https?:\/\//, '').split('/')[0];
    const redirectUri = encodeURIComponent(`https://${cleanDomain}/dashboard/callback`);
    const clientId = process.env.DISCORD_CLIENT_ID;

    const state = randomBytes(16).toString('hex');
    res.cookie('oauth_state', state, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000,
    });

    const loginUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=identify%20guilds&state=${state}`;

    let html = readFileSync(resolve('src/website/views/login.html'), 'utf8');
    html = html.replace('{{loginUrl}}', loginUrl);
    res.send(html);
  });

  router.get('/callback', async (req, res) => {
    const { code, state } = req.query;
    const storedState = req.cookies?.oauth_state;

    if (!code || !state || state !== storedState) {
      return res.redirect('/dashboard/login?error=invalid_state');
    }

    res.clearCookie('oauth_state');

    try {
      const domain = process.env.DOMAIN || 'severe-daryl-officialplaystation5-0f1738f5.koyeb.app';
      const cleanDomain = domain.toLowerCase().trim().replace(/^https?:\/\//, '').split('/')[0];
      const redirectUri = `https://${cleanDomain}/dashboard/callback`;

      const tokenRes = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const { access_token } = tokenRes.data;
      res.cookie('dash_token', access_token, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      res.redirect('/dashboard');
    } catch (err) {
      console.error('[DASHBOARD AUTH]', err.response?.data || err.message);
      res.redirect('/dashboard/login?error=auth_failed');
    }
  });

  router.get('/logout', (req, res) => {
    res.clearCookie('dash_token');
    if (req.query.switch) return res.redirect('/dashboard/login');
    res.redirect('/');
  });

  return router;
}
