import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import { generateToken, authenticate, AuthRequest } from '../auth';

const router = Router();

router.post('/register', (req: Request, res: Response): void => {
  const { username: rawUsername, email: rawEmail, password, confirmPassword } = req.body;
  const username = typeof rawUsername === 'string' ? rawUsername.trim() : '';
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';

  if (typeof password !== 'string' || !username || !email || !password) {
    res.status(400).json({ error: 'Toate câmpurile sunt obligatorii.' });
    return;
  }

  if (password !== confirmPassword) {
    res.status(400).json({ error: 'Parolele nu coincid.' });
    return;
  }

  if (password.length < 10 || password.length > 128) {
    res.status(400).json({ error: 'Parola trebuie să aibă între 10 și 128 de caractere.' });
    return;
  }

  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Adresa de email nu este validă.' });
    return;
  }

  if (!/^[a-zA-Z0-9_ăâîșțĂÂÎȘȚ-]{3,20}$/.test(username)) {
    res.status(400).json({ error: 'Numele de utilizator trebuie să aibă între 3 și 20 de caractere.' });
    return;
  }

  if (db.findUserByUsername(username)) {
    res.status(400).json({ error: 'Acest nume de utilizator este deja folosit.' });
    return;
  }

  if (db.findUserByEmail(email)) {
    res.status(400).json({ error: 'Acest email este deja înregistrat.' });
    return;
  }

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);
  const id = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const newUser = {
    id,
    username,
    email,
    passwordHash,
    role: 'user' as const,
    createdAt: new Date().toISOString(),
    profile: {
      id,
      username,
      email,
      role: 'user' as const,
      avatar: 'av_vlad',
      frame: 'fr_gold',
      title: 'Jucător',
      rating: 1200,
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      territoriesConquered: 0,
      correctAnswersTotal: 0,
      highestScore: 0,
      createdAt: new Date().toISOString(),
    },
  };

  db.createUser(newUser);
  const token = generateToken(id, 'user');

  res.json({
    token,
    user: newUser.profile,
  });
});

router.post('/login', (req: Request, res: Response): void => {
  const { loginIdentifier, password } = req.body;

  if (typeof loginIdentifier !== 'string' || typeof password !== 'string' || !loginIdentifier.trim() || !password || loginIdentifier.length > 254 || password.length > 128) {
    res.status(400).json({ error: 'Introduceți utilizatorul/emailul și parola.' });
    return;
  }

  const user = db.findUserByUsername(loginIdentifier) || db.findUserByEmail(loginIdentifier);

  if (!user) {
    res.status(401).json({ error: 'Date de autentificare incorecte.' });
    return;
  }

  if (user.isBanned) {
    res.status(403).json({ error: 'Acest cont a fost suspendat de către administrator.' });
    return;
  }

  const isMatch = bcrypt.compareSync(password, user.passwordHash);
  if (!isMatch) {
    res.status(401).json({ error: 'Date de autentificare incorecte.' });
    return;
  }

  const token = generateToken(user.id, user.role);
  res.json({
    token,
    user: user.profile,
  });
});

router.post('/guest', (req: Request, res: Response): void => {
  const GUEST_NAMES = [
    'Cavalerul_Carpatin',
    'Voinicul_Radu',
    'Haiducul_Codrilor',
    'Arcasul_Stefan',
    'Razesul_Moldovean',
    'Banul_Oltean',
    'Pribeagul_Transilvan',
    'Capitanul_Dunarean',
  ];
  const randomName = `${GUEST_NAMES[Math.floor(Math.random() * GUEST_NAMES.length)]}_${Math.floor(100 + Math.random() * 900)}`;
  const id = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const guestUser = {
    id,
    username: randomName,
    email: `${randomName.toLowerCase()}@guest.conquiz.ro`,
    passwordHash: '',
    role: 'user' as const,
    createdAt: new Date().toISOString(),
    profile: {
      id,
      username: randomName,
      email: `${randomName.toLowerCase()}@guest.conquiz.ro`,
      role: 'user' as const,
      avatar: 'av_razes',
      frame: 'fr_gold',
      title: 'Oaspete',
      rating: 1200,
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      territoriesConquered: 0,
      correctAnswersTotal: 0,
      highestScore: 0,
      createdAt: new Date().toISOString(),
    },
  };

  db.createUser(guestUser);
  const token = generateToken(id, 'user');
  res.json({
    token,
    user: guestUser.profile,
  });
});

router.get('/me', authenticate, (req: AuthRequest, res: Response): void => {
  const user = db.findUserById(req.userId!);
  if (!user) {
    res.status(404).json({ error: 'Utilizatorul nu a fost găsit.' });
    return;
  }
  const notifs = db.getNotifications(req.userId!);
  const unreadNotifs = notifs.filter(n => !n.isRead).length;

  res.json({
    user: user.profile,
    unreadNotificationsCount: unreadNotifs,
  });
});

router.put('/profile', authenticate, (req: AuthRequest, res: Response): void => {
  const { username, avatar, frame, title } = req.body;
  const user = db.findUserById(req.userId!);
  if (!user) {
    res.status(404).json({ error: 'Utilizatorul nu a fost găsit.' });
    return;
  }

  if (username && username !== user.username) {
    if (!/^[a-zA-Z0-9_ăâîșțĂÂÎȘȚ-]{3,20}$/.test(username)) {
      res.status(400).json({ error: 'Numele trebuie să conțină între 3 și 20 de caractere.' });
      return;
    }
    const existing = db.findUserByUsername(username);
    if (existing && existing.id !== user.id) {
      res.status(400).json({ error: 'Acest nume este deja ocupat de alt jucător.' });
      return;
    }
  }

  const updated = db.updateUserProfile(user.id, {
    ...(username ? { username } : {}),
    ...(avatar ? { avatar } : {}),
    ...(frame ? { frame } : {}),
    ...(title ? { title } : {}),
  });

  res.json({ user: updated });
});

router.put('/password', authenticate, (req: AuthRequest, res: Response): void => {
  const { currentPassword, newPassword } = req.body;
  const user = db.findUserById(req.userId!);
  if (!user) {
    res.status(404).json({ error: 'Utilizatorul nu a fost găsit.' });
    return;
  }

  if (!user.passwordHash) {
    res.status(400).json({ error: 'Conturile de oaspete nu au o parolă de schimbat. Creează un cont cu email și parolă.' });
    return;
  }

  if (typeof currentPassword !== 'string' || !bcrypt.compareSync(currentPassword, user.passwordHash)) {
    res.status(400).json({ error: 'Parola actuală este incorectă.' });
    return;
  }

  if (typeof newPassword !== 'string' || newPassword.length < 10 || newPassword.length > 128) {
    res.status(400).json({ error: 'Noua parolă trebuie să aibă între 10 și 128 de caractere.' });
    return;
  }

  const salt = bcrypt.genSaltSync(10);
  user.passwordHash = bcrypt.hashSync(newPassword, salt);
  db.save();

  res.json({ success: true, message: 'Parola a fost schimbată cu succes!' });
});

export default router;
