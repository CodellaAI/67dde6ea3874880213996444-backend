
const mongoose = require('mongoose');

const VoteSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  item: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'itemType'
  },
  itemType: {
    type: String,
    required: true,
    enum: ['post', 'comment']
  },
  value: {
    type: Number,
    required: true,
    enum: [-1, 1]
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index to ensure a user can only have one vote per item
VoteSchema.index({ user: 1, item: 1 }, { unique: true });

module.exports = mongoose.model('Vote', VoteSchema);
