/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();

/**
 * Import Middlewares
 */
const authenticate = require('./../middlewares/authenticate')
  .clientAuthMiddleWare;

/**
 * Import and Register Routes
 */
const clientAuth = require('./clientAuth.route');
const application = require('./application.route');
const client = require('./client.route');
const debtor = require('./debtor.route');
const document = require('./document.route');
const note = require('./note.route');
const organization = require('./organization.route');
const policy = require('./policy.route');
const task = require('./task.route');
const user = require('./user.route');

router.use('/auth', clientAuth);
router.use(authenticate);
router.use('/application', application);
router.use('/client', client);
router.use('/debtor', debtor);
router.use('/document', document);
router.use('/note', note);
router.use('/organization', organization);
router.use('/policy', policy);
router.use('/task', task);
router.use('/user', user);

/**
 * Export Router
 */
module.exports = router;
