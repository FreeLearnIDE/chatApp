const multer = require('multer');
const sharp = require('sharp');

const User = require('../models/userModel');
const Notification = require('../models/notificationModel');
const Post = require('../models/postModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

const multerStorage = multer.memoryStorage();

const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) {
    cb(null, true);
  } else {
    cb(new AppError('Not an image! Please upload only images.', 400), false);
  }
};

const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter
});

exports.uploadPost = upload.single('content');

exports.resizePhoto = catchAsync(async (req, res, next) => {
  if (!req.file) return next(new AppError('There is no content in this post!', 400));

  req.file.post = `post-${req.user.id}-${Date.now()}.jpeg`;

  await sharp(req.file.buffer)
    .resize(1000, 800)
    .toFormat('jpeg')
    .jpeg({ quality: 90 })
    .toFile(`public/img/posts/${req.file.post}`);

  next();
});

exports.createPost = catchAsync(async (req, res, next) => {
  req.body.content = req.file.post;
  req.body.user = req.user._id;
  const post = await Post.create(req.body);

  res.status(200).json({
    status: 'success',
    data: {
      post
    }
  });
});

exports.likePost = catchAsync(async (req, res, next) => {
  const updatedPost = await Post.findByIdAndUpdate(
    req.params.postId,
    {
      $push: {
        likes: req.user._id
      }
    },
    {
      new: true
    }
  );

  if (req.user.id != updatedPost.user._id) {
    const notificationData = {
      type: 'like',
      post: updatedPost._id,
      from: req.user._id,
      to: updatedPost.user._id
    };

    var notification = await Notification.create(notificationData);
  }

  const likeData = {
    _id: req.user.id,
    profilePhoto: req.user.profilePhoto,
    firstName: req.user.firstName,
    lastName: req.user.lastName
  };

  res.status(200).json({
    status: 'success',
    data: likeData
  });

  if (notification) {
    await User.findByIdAndUpdate(updatedPost.user._id, { $push: { newNotifications: notification._id } });
  }
});

exports.makeComment = catchAsync(async (req, res, next) => {
  if (!req.body.text) {
    return next(new AppError('You must have some text in your comment!', 400));
  }

  const commentData = {
    user: req.user._id,
    comment: req.body.text
  };

  const updatedPost = await Post.findByIdAndUpdate(
    req.params.postId,
    {
      $push: {
        comments: commentData
      }
    },
    { new: true }
  );

  if (req.user.id != updatedPost.user._id) {
    const notificationData = {
      type: 'comment',
      post: updatedPost._id,
      from: req.user._id,
      to: updatedPost.user._id
    };

    var notification = await Notification.create(notificationData);
  }

  const commentDataRes = {
    user: {
      _id: req.user._id,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      profilePhoto: req.user.profilePhoto
    },
    comment: req.body.text
  };

  res.status(200).json({
    status: 'success',
    data: {
      commentData: commentDataRes
    }
  });

  if (notification) {
    await User.findByIdAndUpdate(updatedPost.user._id, { $push: { newNotifications: notification._id } });
  }
});

exports.getPost = catchAsync(async (req, res, next) => {
  const post = await Post.findById(req.params.postId).select('-__v');

  if (!post) {
    return next(new AppError('There is no post with that ID!', 404));
  }

  for (let i = 0; i < post.likes.length; i++) {
    if (post.likes[i]._id == req.user.id) {
      post.likedByMe = true;
      break;
    }
  }

  res.status(200).json({
    status: 'success',
    data: {
      post
    }
  });
});

exports.deletePost = catchAsync(async (req, res, next) => {
  await Post.findByIdAndDelete(req.params.postId);
  await Notification.deleteMany({ post: req.params.postId });

  res.status(204).json({
    status: 'success',
    data: null
  });
});
