const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { Company, User, DEFAULT_COLUMNS } = require('../models');
const { HttpError, wrap, signToken, auth, publicUser, slugify } = require('../lib');

function checkPasswordRules(pw) {
  const p = typeof pw === 'string' ? pw : '';
  return {
    length: p.length >= 12,
    lower: /[a-z]/.test(p),
    upper: /[A-Z]/.test(p),
    digit: /[0-9]/.test(p),
    special: /[^A-Za-z0-9]/.test(p),
  };
}

function validatePassword(pw) {
  if (typeof pw !== 'string') {
    throw new HttpError(400, 'Format de mot de passe invalide');
  }
  const rules = checkPasswordRules(pw);
  const missing = [];
  if (!rules.length) missing.push('au moins 12 caractères');
  if (!rules.lower) missing.push('une lettre minuscule');
  if (!rules.upper) missing.push('une lettre majuscule');
  if (!rules.digit) missing.push('un chiffre');
  if (!rules.special) missing.push('un caractère spécial (ex. !@#$%^&*...)');

  if (missing.length > 0) {
    throw new HttpError(400, `Mot de passe non conforme : il requiert ${missing.join(', ')}.`);
  }
}

// Inscription = création d'une entreprise + de son propriétaire (owner)
router.post('/register', wrap(async (req, res) => {
  const { companyName, name, email, password } = req.body || {};
  if (!companyName || !name || !email) throw new HttpError(400, 'Entreprise, nom et e-mail sont obligatoires');
  validatePassword(password);
  if (await User.exists({ email: String(email).toLowerCase().trim() })) throw new HttpError(409, 'Cet e-mail est déjà utilisé');

  let slug = slugify(companyName);
  if (await Company.exists({ slug })) slug = `${slug}-${Date.now().toString(36)}`;

  const company = await Company.create({ name: companyName, slug, settings: { defaultColumns: DEFAULT_COLUMNS } });
  try {
    const user = await User.create({
      companyId: company._id,
      name,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role: 'owner',
    });
    res.status(201).json({ token: signToken(user), user: publicUser(user), company });
  } catch (e) {
    await Company.deleteOne({ _id: company._id }); // compensation (pas de transaction en standalone)
    throw e;
  }
}));

router.post('/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  const user = await User.findOne({ email: String(email || '').toLowerCase().trim() }).select('+passwordHash');
  if (!user || !user.active || !(await bcrypt.compare(String(password || ''), user.passwordHash))) {
    throw new HttpError(401, 'Identifiants incorrects');
  }
  user.lastLoginAt = new Date();
  await user.save();
  const company = await Company.findById(user.companyId).lean();
  res.json({ token: signToken(user), user: publicUser(user), company });
}));

router.get('/me', auth, wrap(async (req, res) => {
  const company = await Company.findById(req.companyId).lean();
  res.json({ user: publicUser(req.user), company });
}));

router.put('/me', auth, wrap(async (req, res) => {
  const { name, jobTitle, currentPassword, newPassword } = req.body || {};
  const user = await User.findOne(req.tenant({ _id: req.user._id })).select('+passwordHash');
  if (name) user.name = name;
  if (jobTitle !== undefined) user.jobTitle = jobTitle;
  if (newPassword) {
    if (!(await bcrypt.compare(String(currentPassword || ''), user.passwordHash))) throw new HttpError(400, 'Mot de passe actuel incorrect');
    validatePassword(newPassword);
    user.passwordHash = await bcrypt.hash(newPassword, 10);
  }
  await user.save();
  res.json(publicUser(user));
}));

module.exports = router;
module.exports.validatePassword = validatePassword;
module.exports.checkPasswordRules = checkPasswordRules;
