import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getAsync, runAsync } from './database.js';
import { AuthenticationError, ConflictError } from './utils/errors.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10');

export interface TokenPayload {
  id: string;
  login: string;
  role: string;
}

export const generateToken = (userId: string, login: string, role: string): string => {
  return jwt.sign(
    { id: userId, login, role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

export const verifyToken = (token: string): TokenPayload => {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch (error) {
    throw new AuthenticationError('Неверный или истекший токен');
  }
};

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
};

export const comparePassword = async (password: string, hashedPassword: string): Promise<boolean> => {
  return bcrypt.compare(password, hashedPassword);
};

export const validateLoginCredentials = async (login: string, password: string): Promise<TokenPayload> => {
  if (!login || !password) {
    throw new AuthenticationError('Логин и пароль обязательны');
  }

  if (password.length < 3) {
    throw new AuthenticationError('Пароль должен содержать минимум 3 символа');
  }

  const user = await getAsync('SELECT id, login, password, role FROM users WHERE LOWER(login) = LOWER(?)', [login]);

  if (!user) {
    throw new AuthenticationError('Неверный логин или пароль');
  }

  const isPasswordValid = await comparePassword(password, user.password);
  if (!isPasswordValid) {
    throw new AuthenticationError('Неверный логин или пароль');
  }

  return {
    id: user.id,
    login: user.login,
    role: user.role
  };
};

export const createUser = async (login: string, password: string, role: string = 'user'): Promise<any> => {
  if (!login || !password) {
    throw new AuthenticationError('Логин и пароль обязательны');
  }

  if (password.length < 3) {
    throw new AuthenticationError('Пароль должен содержать минимум 3 символа');
  }

  // Проверяем что логин не существует (case-insensitive)
  const existingUser = await getAsync('SELECT id FROM users WHERE LOWER(login) = LOWER(?)', [login]);
  if (existingUser) {
    throw new ConflictError('Логин уже существует');
  }

  const userId = uuidv4();
  const hashedPassword = await hashPassword(password);

  await runAsync(
    'INSERT INTO users (id, login, password, role) VALUES (?, ?, ?, ?)',
    [userId, login, hashedPassword, role]
  );

  return {
    id: userId,
    login,
    role: role
  };
};
