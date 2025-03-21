
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Post = require('../models/Post');
const Community = require('../models/Community');
const Comment = require('../models/Comment');
const Vote = require('../models/Vote');
const auth = require('../middleware/auth');
const mongoose = require('mongoose');

// @route   GET api/posts
// @desc    Get all posts (paginated)
// @access  Public
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('author', 'username avatar')
      .lean();
    
    // Get total count
    const total = await Post.countDocuments();
    
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
    
    // Check if user is authenticated to add vote info
    let userId = null;
    if (req.cookies.token) {
      try {
        const decoded = jwt.verify(req.cookies.token, process.env.JWT_SECRET);
        userId = decoded.user.id;
      } catch (err) {
        // Invalid token, continue without user context
      }
    }
    
    // If user is authenticated, get their votes
    let userVotes = {};
    if (userId) {
      const votes = await Vote.find({
        user: userId,
        item: { $in: postIds },
        itemType: 'post'
      });
      
      votes.forEach(vote => {
        userVotes[vote.item.toString()] = vote.value;
      });
    }
    
    // Add user vote info to posts
    const finalPosts = postsWithCommentCount.map(post => ({
      ...post,
      userVote: userVotes[post._id.toString()] || 0
    }));
    
    res.json({
      posts: finalPosts,
      hasMore: skip + posts.length < total
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET api/posts/community/:communityName
// @desc    Get posts by community
// @access  Public
router.get('/community/:communityName', async (req, res) => {
  try {
    const { communityName } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Find the community first
    const community = await Community.findOne({ name: communityName });
    if (!community) {
      return res.status(404).json({ message: 'Community not found' });
    }
    
    const posts = await Post.find({ community: communityName })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('author', 'username avatar')
      .lean();
    
    // Get total count
    const total = await Post.countDocuments({ community: communityName });
    
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
    
    // Check if user is authenticated to add vote info
    let userId = null;
    if (req.cookies.token) {
      try {
        const decoded = jwt.verify(req.cookies.token, process.env.JWT_SECRET);
        userId = decoded.user.id;
      } catch (err) {
        // Invalid token, continue without user context
      }
    }
    
    // If user is authenticated, get their votes
    let userVotes = {};
    if (userId) {
      const votes = await Vote.find({
        user: userId,
        item: { $in: postIds },
        itemType: 'post'
      });
      
      votes.forEach(vote => {
        userVotes[vote.item.toString()] = vote.value;
      });
    }
    
    // Add user vote info to posts
    const finalPosts = postsWithCommentCount.map(post => ({
      ...post,
      userVote: userVotes[post._id.toString()] || 0
    }));
    
    res.json({
      posts: finalPosts,
      hasMore: skip + posts.length < total
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET api/posts/:id
// @desc    Get post by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('author', 'username avatar')
      .lean();
    
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    
    // Get comment count
    const commentCount = await Comment.countDocuments({ post: post._id });
    post.commentCount = commentCount;
    
    // Check if user is authenticated to add vote info
    let userId = null;
    if (req.cookies.token) {
      try {
        const decoded = jwt.verify(req.cookies.token, process.env.JWT_SECRET);
        userId = decoded.user.id;
        
        // Check if user is the author
        post.isAuthor = post.author._id.toString() === userId;
        
        // Get user's vote on this post
        const vote = await Vote.findOne({
          user: userId,
          item: post._id,
          itemType: 'post'
        });
        
        post.userVote = vote ? vote.value : 0;
      } catch (err) {
        // Invalid token, continue without user context
      }
    }
    
    res.json(post);
  } catch (err) {
    console.error(err.message);
    
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Post not found' });
    }
    
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST api/posts
// @desc    Create a post
// @access  Private
router.post(
  '/',
  [
    auth,
    body('title').not().isEmpty().withMessage('Title is required').trim(),
    body('community').not().isEmpty().withMessage('Community is required').trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array(), message: errors.array()[0].msg });
    }

    try {
      const { title, content, community } = req.body;
      
      // Check if community exists
      const communityDoc = await Community.findOne({ name: community });
      if (!communityDoc) {
        return res.status(404).json({ message: 'Community not found' });
      }
      
      // Create new post
      const newPost = new Post({
        title,
        content,
        author: req.user.id,
        community,
        votes: 0
      });
      
      const post = await newPost.save();
      
      // Auto-upvote your own post
      const newVote = new Vote({
        user: req.user.id,
        item: post._id,
        itemType: 'post',
        value: 1
      });
      
      await newVote.save();
      
      // Update post votes count
      post.votes = 1;
      await post.save();
      
      res.json(post);
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// @route   PUT api/posts/:id
// @desc    Update a post
// @access  Private
router.put(
  '/:id',
  [
    auth,
    body('title').not().isEmpty().withMessage('Title is required').trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array(), message: errors.array()[0].msg });
    }

    try {
      const { title, content } = req.body;
      
      // Find post
      const post = await Post.findById(req.params.id);
      
      if (!post) {
        return res.status(404).json({ message: 'Post not found' });
      }
      
      // Check user
      if (post.author.toString() !== req.user.id) {
        return res.status(401).json({ message: 'User not authorized' });
      }
      
      // Update post
      post.title = title;
      post.content = content;
      post.isEdited = true;
      
      await post.save();
      
      res.json(post);
    } catch (err) {
      console.error(err.message);
      
      if (err.kind === 'ObjectId') {
        return res.status(404).json({ message: 'Post not found' });
      }
      
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// @route   DELETE api/posts/:id
// @desc    Delete a post
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    
    // Check user
    if (post.author.toString() !== req.user.id) {
      return res.status(401).json({ message: 'User not authorized' });
    }
    
    // Delete all comments associated with the post
    await Comment.deleteMany({ post: post._id });
    
    // Delete all votes associated with the post
    await Vote.deleteMany({ item: post._id, itemType: 'post' });
    
    // Delete the post
    await post.remove();
    
    res.json({ message: 'Post deleted' });
  } catch (err) {
    console.error(err.message);
    
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Post not found' });
    }
    
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST api/posts/:id/vote
// @desc    Vote on a post
// @access  Private
router.post('/:id/vote', auth, async (req, res) => {
  try {
    const { voteType } = req.body;
    
    // Validate vote type (-1, 0, 1)
    if (![1, 0, -1].includes(voteType)) {
      return res.status(400).json({ message: 'Invalid vote type' });
    }
    
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    
    // Check if user has already voted
    let vote = await Vote.findOne({
      user: req.user.id,
      item: post._id,
      itemType: 'post'
    });
    
    let voteChange = 0;
    
    if (vote) {
      // User has already voted, update the vote
      voteChange = voteType - vote.value;
      
      if (voteType === 0) {
        // Remove the vote
        await vote.remove();
      } else {
        // Update the vote
        vote.value = voteType;
        await vote.save();
      }
    } else if (voteType !== 0) {
      // User has not voted and is casting a non-zero vote
      vote = new Vote({
        user: req.user.id,
        item: post._id,
        itemType: 'post',
        value: voteType
      });
      
      await vote.save();
      voteChange = voteType;
    }
    
    // Update post votes count
    post.votes += voteChange;
    await post.save();
    
    res.json({ votes: post.votes });
  } catch (err) {
    console.error(err.message);
    
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Post not found' });
    }
    
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET api/posts/:id/comments
// @desc    Get comments for a post
// @access  Public
router.get('/:id/comments', async (req, res) => {
  try {
    const comments = await Comment.find({ post: req.params.id })
      .sort({ createdAt: -1 })
      .populate('author', 'username avatar')
      .lean();
    
    // Check if user is authenticated to add vote info
    let userId = null;
    if (req.cookies.token) {
      try {
        const decoded = jwt.verify(req.cookies.token, process.env.JWT_SECRET);
        userId = decoded.user.id;
      } catch (err) {
        // Invalid token, continue without user context
      }
    }
    
    // If user is authenticated, get their votes and check authorship
    if (userId) {
      const commentIds = comments.map(comment => comment._id);
      
      const votes = await Vote.find({
        user: userId,
        item: { $in: commentIds },
        itemType: 'comment'
      });
      
      const voteMap = {};
      votes.forEach(vote => {
        voteMap[vote.item.toString()] = vote.value;
      });
      
      // Add user vote info and authorship to comments
      comments.forEach(comment => {
        comment.userVote = voteMap[comment._id.toString()] || 0;
        comment.isAuthor = comment.author._id.toString() === userId;
      });
    }
    
    res.json(comments);
  } catch (err) {
    console.error(err.message);
    
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Post not found' });
    }
    
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST api/posts/:id/comments
// @desc    Add comment to a post
// @access  Private
router.post(
  '/:id/comments',
  [
    auth,
    body('content').not().isEmpty().withMessage('Comment content is required').trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array(), message: errors.array()[0].msg });
    }

    try {
      const post = await Post.findById(req.params.id);
      if (!post) {
        return res.status(404).json({ message: 'Post not found' });
      }
      
      const newComment = new Comment({
        content: req.body.content,
        author: req.user.id,
        post: req.params.id,
        votes: 1 // Auto-upvote your own comment
      });
      
      const comment = await newComment.save();
      
      // Auto-upvote your own comment
      const newVote = new Vote({
        user: req.user.id,
        item: comment._id,
        itemType: 'comment',
        value: 1
      });
      
      await newVote.save();
      
      // Populate author info
      await comment.populate('author', 'username avatar');
      
      // Add isAuthor flag
      const commentObj = comment.toObject();
      commentObj.isAuthor = true;
      commentObj.userVote = 1;
      
      res.json(commentObj);
    } catch (err) {
      console.error(err.message);
      
      if (err.kind === 'ObjectId') {
        return res.status(404).json({ message: 'Post not found' });
      }
      
      res.status(500).json({ message: 'Server error' });
    }
  }
);

module.exports = router;
