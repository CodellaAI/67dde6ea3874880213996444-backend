
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');

// @route   POST api/auth/signup
// @desc    Register a user
// @access  Public
router.post(
  '/signup',
  [
    body('username')
      .isLength({ min: 3, max: 20 })
      .withMessage('Username must be between 3 and 20 characters')
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Username can only contain letters, numbers, underscores, and hyphens')
      .custom(async value => {
        const user = await User.findOne({ username: value });
        if (user) {
          return Promise.reject('Username already exists');
        }
      }),
    body('email')
      .isEmail()
      .withMessage('Please include a valid email')
      .custom(async value => {
        const user = await User.findOne({ email: value });
        if (user) {
          return Promise.reject('Email already exists');
        }
      }),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array(), message: errors.array()[0].msg });
    }

    try {
      const { username, email, password } = req.body;

      // Create new user
      const user = new User({
        username,
        email,
        password,
      });

      // Hash password
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt);

      await user.save();

      res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// @route   POST api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post(
  '/login',
  [
    body('username').exists().withMessage('Username is required'),
    body('password').exists().withMessage('Password is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array(), message: errors.array()[0].msg });
    }

    try {
      const { username, password } = req.body;

      // Check if user exists
      const user = await User.findOne({ username });
      if (!user) {
        return res.status(400).json({ message: 'Invalid credentials' });
      }

      // Check password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: 'Invalid credentials' });
      }

      // Create JWT token
      const payload = {
        user: {
          id: user.id,
        },
      };

      jwt.sign(
        payload,
        process.env.JWT_SECRET,
        { expiresIn: '7d' },
        (err, token) => {
          if (err) throw err;
          
          // Set cookie
          res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            sameSite: 'lax',
          });
          
          // Return user data (without password)
          const userData = {
            _id: user._id,
            username: user.username,
            email: user.email,
            avatar: user.avatar,
            karma: user.karma,
            createdAt: user.createdAt,
          };
          
          res.json({ token, user: userData });
        }
      );
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// @route   POST api/auth/logout
// @desc    Logout user by clearing cookie
// @access  Private
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

// @route   GET api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
