
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const auth = require('../middleware/auth');

// @route   GET api/users/:username
// @desc    Get user by username
// @access  Public
router.get('/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username })
      .select('-password -email')
      .lean();
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Calculate karma
    const karma = await calculateKarma(user._id);
    user.karma = karma;
    
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET api/users/:username/posts
// @desc    Get posts by username
// @access  Public
router.get('/:username/posts', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const posts = await Post.find({ author: user._id })
      .sort({ createdAt: -1 })
      .populate('author', 'username avatar')
      .lean();
    
    // Get comment counts
    const postIds = posts.map(post => post._id);
    const commentCounts = await Comment.aggregate([
      { $match: { post: { $in: postIds } } },
      { $group: { _id: '$post', count: { $sum: 1 } } }
    ]);
    
    // Create a map of post ID to comment count
    const commentCountMap = {};
    commentCounts.forEach(item => {
      commentCountMap[item._id.toString()] = item.count;
    });
    
    // Add comment count to each post
    const postsWithCommentCount = posts.map(post => ({
      ...post,
      commentCount: commentCountMap[post._id.toString()] || 0
    }));
    
    res.json(postsWithCommentCount);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET api/users/:username/comments
// @desc    Get comments by username
// @access  Public
router.get('/:username/comments', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const comments = await Comment.find({ author: user._id })
      .sort({ createdAt: -1 })
      .populate('author', 'username avatar')
      .populate('post', 'title community')
      .lean();
    
    res.json(comments);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT api/users/profile
// @desc    Update user profile
// @access  Private
router.put(
  '/profile',
  [
    auth,
    body('bio').optional().isLength({ max: 500 }).withMessage('Bio cannot exceed 500 characters'),
    body('avatar').optional().isURL().withMessage('Avatar must be a valid URL'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array(), message: errors.array()[0].msg });
    }

    try {
      const { bio, avatar } = req.body;
      
      // Find user
      const user = await User.findById(req.user.id);
      
      if (bio !== undefined) user.bio = bio;
      if (avatar !== undefined) user.avatar = avatar;
      
      await user.save();
      
      // Return user without password
      const userResponse = await User.findById(req.user.id).select('-password');
      
      res.json(userResponse);
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Helper function to calculate karma
async function calculateKarma(userId) {
  try {
    // Get post votes
    const posts = await Post.find({ author: userId });
    const postKarma = posts.reduce((total, post) => total + post.votes, 0);
    
    // Get comment votes
    const comments = await Comment.find({ author: userId });
    const commentKarma = comments.reduce((total, comment) => total + comment.votes, 0);
    
    return postKarma + commentKarma;
  } catch (err) {
    console.error('Error calculating karma:', err);
    return 0;
  }
}

module.exports = router;
