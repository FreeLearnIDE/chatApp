const Game = require('../models/gameModel');
const User = require('../models/userModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

exports.getAllGames = catchAsync(async (req, res, next) => {
  const games = await Game.find({ winner: { $ne: undefined } });

  if (!games) {
    return next(new AppError('There is no games yet!', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      games
    }
  });
});

const createGame = async (req, userId) => {
  const homePlayer = req.user;
  const awayPlayer = await User.findById(userId);

  if (!awayPlayer) {
    return next(new AppError('There is no user with that ID!', 404));
  }

  const game = await Game.create({ players: [homePlayer, awayPlayer], homePlayer, awayPlayer });

  return game;
};

exports.sendGameRequest = catchAsync(async (req, res, next) => {
  if (req.user.gameRequest.gameId) {
    return next(new AppError('You already have a pending request! Check your notifications.', 400));
  }

  const wantedUser = await User.findById(req.params.userId);
  if (wantedUser.gameRequest.gameId) {
    return next(new AppError('This user already has a request. Try another one!', 400));
  }

  if (req.params.userId === req.user.id) {
    return next(new AppError('This action is invalid!', 400));
  }

  const game = await createGame(req, req.params.userId);

  const gameRequest = {
    userId: req.user.id,
    gameId: game._id,
    firstName: req.user.firstName,
    lastName: req.user.lastName,
    profilePhoto: req.user.profilePhoto,
    accepted: false
  };

  const user = await User.findByIdAndUpdate(req.params.userId, { gameRequest }, { new: true });

  if (!user) {
    return next(new AppError('There is no user with that ID!', 404));
  }

  // Update current user with the request
  await User.findByIdAndUpdate(req.user.id, { gameRequest });

  res.status(200).json({
    status: 'success',
    data: {
      game
    }
  });
});

exports.checkGameRequest = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.userId);

  if (!user) {
    return next(new AppError('User with this ID no longer exists.', 404));
  }

  if (user.gameRequest.accepted === false) {
    return res.status(200).json({
      status: 'pending'
    });
  } else {
    const game = await Game.findById(user.gameRequest.gameId);
    return res.status(200).json({
      status: 'accepted',
      data: {
        game
      }
    });
  }
});

exports.updateRoundScore = catchAsync(async (req, res, next) => {
  if (!req.body.currentScore) {
    return next(new AppError('There is no value to update!', 400));
  }

  let game;

  if (req.params.player === 'homePlayer') {
    if (req.body.currentScore === 1) {
      game = await Game.findByIdAndUpdate(
        req.params.gameId,
        { 'homePlayer.currentScore': 0, 'homePlayer.roundScore': 0, 'homePlayer.active': false, 'awayPlayer.active': true },
        {
          new: true
        }
      );
    } else {
      game = await Game.findByIdAndUpdate(
        req.params.gameId,
        { 'homePlayer.currentScore': req.body.currentScore, $inc: { 'homePlayer.roundScore': req.body.currentScore } },
        {
          new: true
        }
      );
    }
  } else if (req.params.player === 'awayPlayer') {
    if (req.body.currentScore === 1) {
      game = await Game.findByIdAndUpdate(
        req.params.gameId,
        { 'awayPlayer.currentScore': 0, 'awayPlayer.roundScore': 0, 'awayPlayer.active': false, 'homePlayer.active': true },
        {
          new: true
        }
      );
    } else {
      game = await Game.findByIdAndUpdate(
        req.params.gameId,
        { 'awayPlayer.currentScore': req.body.currentScore, $inc: { 'awayPlayer.roundScore': req.body.currentScore } },
        {
          new: true
        }
      );
    }
  }

  if (!game) {
    return next(new AppError('There is no game with that ID!', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      game
    }
  });
});

exports.updateTotalScore = catchAsync(async (req, res, next) => {
  if (!req.body.roundScore) {
    return next(new AppError('There is no value to update!', 400));
  }

  let game;

  if (req.params.player === 'homePlayer') {
    game = await Game.findByIdAndUpdate(
      req.params.gameId,
      {
        'homePlayer.currentScore': 0,
        $inc: { 'homePlayer.totalScore': req.body.roundScore },
        'homePlayer.roundScore': 0,
        'homePlayer.active': false,
        'awayPlayer.active': true
      },
      { new: true }
    );
  } else if (req.params.player === 'awayPlayer') {
    game = await Game.findByIdAndUpdate(
      req.params.gameId,
      {
        'awayPlayer.currentScore': 0,
        $inc: { 'awayPlayer.totalScore': req.body.roundScore },
        'awayPlayer.roundScore': 0,
        'awayPlayer.active': false,
        'homePlayer.active': true
      },
      { new: true }
    );
  }

  if (!game) {
    return next(new AppError('There is no game with that ID!', 404));
  }

  if (game[req.params.player].totalScore >= 10) {
    game = await Game.findByIdAndUpdate(req.params.gameId, { winner: game[req.params.player] }, { new: true });
  }

  res.status(200).json({
    status: 'success',
    data: {
      game
    }
  });
});

exports.checkOppositeScore = catchAsync(async (req, res, next) => {
  const game = await Game.findById(req.params.gameId);

  if (!game) {
    return next(new AppError('There is no game with that ID!', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      game
    }
  });
});

exports.endGame = catchAsync(async (req, res, next) => {
  const game = await Game.findById(req.params.gameId);

  await User.findByIdAndUpdate(game.homePlayer._id, { $unset: { gameRequest: '' } });
  await User.findByIdAndUpdate(game.awayPlayer._id, { $unset: { gameRequest: '' } });

  res.status(200).json({
    status: 'success',
    data: {
      game
    }
  });
});

exports.cancelRequest = catchAsync(async (req, res, next) => {
  if (!req.body.game) {
    return next(new AppError('There is no request in the body!', 400));
  }

  await Game.findByIdAndDelete(req.body.game._id);
  await User.findByIdAndUpdate(req.body.game.homePlayer._id, { $unset: { gameRequest: '' } });
  await User.findByIdAndUpdate(req.body.game.awayPlayer._id, { $unset: { gameRequest: '' } });

  res.status(200).json({
    status: 'success'
  });
});

exports.availableUsers = catchAsync(async (req, res, next) => {
  const users = await User.find({ isLoggedIn: { $eq: true }, gameRequest: { $eq: undefined }, _id: { $ne: req.user.id } });

  res.status(200).json({
    status: 'success',
    data: {
      users
    }
  });
});

exports.setWinner = catchAsync(async (req, res, next) => {
  if (!req.body.winner) {
    return next(new AppError('There is no data in the body!', 400));
  }
  const game = await Game.findByIdAndUpdate(req.params.gameId, { winner: req.body.winner }, { new: true });

  await User.findByIdAndUpdate(game.homePlayer._id, { $unset: { gameRequest: '' } });
  await User.findByIdAndUpdate(game.awayPlayer._id, { $unset: { gameRequest: '' } });

  res.status(200).json({
    status: 'success',
    data: {
      game
    }
  });
});
