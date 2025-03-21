
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Comment = require('../models/Comment');
const Vote = require('../models/Vote');
const auth = require('../middleware/auth');

// @route   PUT api/comments/:id
// @desc    Update a comment
// @access  Private
router.put(
  '/:id',
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
      const comment = await Comment.findById(req.params.id);
      
      if (!comment) {
        return res.status(404).json({ message: 'Comment not found' });
      }
      
      // Check user
      if (comment.author.toString() !== req.user.id) {
        return res.status(401).json({ message: 'User not authorized' });
      }
      
      // Update comment
      comment.content = req.body.content;
      comment.isEdited = true;
      
      await comment.save();
      
      res.json(comment);
    } catch (err) {
      console.error(err.message);
      
      if (err.kind === 'ObjectId') {
        return res.status(404).json({ message: 'Comment not found' });
      }
      
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// @route   DELETE api/comments/:id
// @desc    Delete a comment
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    
    // Check user
    if (comment.author.toString() !== req.user.id) {
      return res.status(401).json({ message: 'User not authorized' });
    }
    
    // Delete all votes associated with the comment
    await Vote.deleteMany({ item: comment._id, itemType: 'comment' });
    
    // Delete the comment
    await comment.remove();
    
    res.json({ message: 'Comment deleted' });
  } catch (err) {
    console.error(err.message);
    
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Comment not found' });
    }
    
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST api/comments/:id/vote
// @desc    Vote on a comment
// @access  Private
router.post('/:id/vote', auth, async (req, res) => {
  try {
    const { voteType } = req.body;
    
    // Validate vote type (-1, 0, 1)
    if (![1, 0, -1].includes(voteType)) {
      return res.status(400).json({ message: 'Invalid vote type' });
    }
    
    const comment = await Comment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    
    // Check if user has already voted
    let vote = await Vote.findOne({
      user: req.user.id,
      item: comment._id,
      itemType: 'comment'
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
        item: comment._id,
        itemType: 'comment',
        value: voteType
      });
      
      await vote.save();
      voteChange = voteType;
    }
    
    // Update comment votes count
    comment.votes += voteChange;
    await comment.save();
    
    res.json({ votes: comment.votes });
  } catch (err) {
    console.error(err.message);
    
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Comment not found' });
    }
    
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
