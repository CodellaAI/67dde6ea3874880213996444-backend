
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Community = require('../models/Community');
const User = require('../models/User');
const auth = require('../middleware/auth');

// @route   GET api/communities
// @desc    Get all communities
// @access  Public
router.get('/', async (req, res) => {
  try {
    const communities = await Community.find()
      .sort({ name: 1 })
      .select('name description type memberCount createdAt');
    
    res.json(communities);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET api/communities/top
// @desc    Get top communities by member count
// @access  Public
router.get('/top', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    
    const communities = await Community.find()
      .sort({ memberCount: -1 })
      .limit(limit)
      .select('name description icon memberCount');
    
    res.json(communities);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET api/communities/:name
// @desc    Get community by name
// @access  Public
router.get('/:name', async (req, res) => {
  try {
    const community = await Community.findOne({ name: req.params.name })
      .populate('creator', 'username')
      .populate('moderators', 'username')
      .lean();
    
    if (!community) {
      return res.status(404).json({ message: 'Community not found' });
    }
    
    // Check if user is authenticated to add membership info
    let userId = null;
    if (req.cookies.token) {
      try {
        const decoded = jwt.verify(req.cookies.token, process.env.JWT_SECRET);
        userId = decoded.user.id;
        
        // Check if user is a member
        community.isJoined = community.members.some(
          memberId => memberId.toString() === userId
        );
        
        // Check if user is a creator or moderator
        community.isCreator = community.creator._id.toString() === userId;
        community.isModerator = community.moderators.some(
          mod => mod._id.toString() === userId
        );
      } catch (err) {
        // Invalid token, continue without user context
      }
    }
    
    // Remove members array from response to reduce payload size
    delete community.members;
    
    res.json(community);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST api/communities
// @desc    Create a community
// @access  Private
router.post(
  '/',
  [
    auth,
    body('name')
      .isLength({ min: 3, max: 21 })
      .withMessage('Community name must be between 3 and 21 characters')
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Community name can only contain letters, numbers, and underscores')
      .custom(async value => {
        const community = await Community.findOne({ name: value });
        if (community) {
          return Promise.reject('Community name already exists');
        }
      }),
    body('description')
      .isLength({ min: 1, max: 500 })
      .withMessage('Description must be between 1 and 500 characters'),
    body('type')
      .isIn(['public', 'restricted', 'private'])
      .withMessage('Type must be public, restricted, or private'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array(), message: errors.array()[0].msg });
    }

    try {
      const { name, description, type } = req.body;
      
      // Create new community
      const newCommunity = new Community({
        name,
        description,
        type,
        creator: req.user.id,
        moderators: [req.user.id],
        members: [req.user.id],
        memberCount: 1,
        rules: [],
      });
      
      const community = await newCommunity.save();
      
      res.status(201).json(community);
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// @route   PUT api/communities/:name
// @desc    Update a community
// @access  Private (moderators only)
router.put(
  '/:name',
  [
    auth,
    body('description')
      .isLength({ min: 1, max: 500 })
      .withMessage('Description must be between 1 and 500 characters'),
    body('type')
      .isIn(['public', 'restricted', 'private'])
      .withMessage('Type must be public, restricted, or private'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array(), message: errors.array()[0].msg });
    }

    try {
      const community = await Community.findOne({ name: req.params.name });
      
      if (!community) {
        return res.status(404).json({ message: 'Community not found' });
      }
      
      // Check if user is a moderator
      if (!community.moderators.includes(req.user.id)) {
        return res.status(401).json({ message: 'User not authorized' });
      }
      
      // Update community fields
      const { description, type, rules, icon } = req.body;
      
      if (description) community.description = description;
      if (type) community.type = type;
      if (rules) community.rules = rules;
      if (icon) community.icon = icon;
      
      await community.save();
      
      res.json(community);
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// @route   POST api/communities/:name/join
// @desc    Join a community
// @access  Private
router.post('/:name/join', auth, async (req, res) => {
  try {
    const community = await Community.findOne({ name: req.params.name });
    
    if (!community) {
      return res.status(404).json({ message: 'Community not found' });
    }
    
    // Check if user is already a member
    if (community.members.includes(req.user.id)) {
      return res.status(400).json({ message: 'User is already a member' });
    }
    
    // Add user to members
    community.members.push(req.user.id);
    community.memberCount += 1;
    
    await community.save();
    
    res.json({ message: 'Joined community successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST api/communities/:name/leave
// @desc    Leave a community
// @access  Private
router.post('/:name/leave', auth, async (req, res) => {
  try {
    const community = await Community.findOne({ name: req.params.name });
    
    if (!community) {
      return res.status(404).json({ message: 'Community not found' });
    }
    
    // Check if user is a member
    if (!community.members.includes(req.user.id)) {
      return res.status(400).json({ message: 'User is not a member' });
    }
    
    // Check if user is the creator
    if (community.creator.toString() === req.user.id) {
      return res.status(400).json({ message: 'Creator cannot leave the community' });
    }
    
    // Remove user from members
    community.members = community.members.filter(
      memberId => memberId.toString() !== req.user.id
    );
    community.memberCount -= 1;
    
    // If user is a moderator, remove from moderators as well
    if (community.moderators.includes(req.user.id)) {
      community.moderators = community.moderators.filter(
        modId => modId.toString() !== req.user.id
      );
    }
    
    await community.save();
    
    res.json({ message: 'Left community successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
