/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const pagination = require('mongoose-paginate');
const Schema = mongoose.Schema;

/**
 * Schema Definition
 */
const taskSchema = new Schema(
  {
    title: { type: Schema.Types.String },
    description: { type: Schema.Types.String },
    priority: {
      type: Schema.Types.String,
      enum: ['URGENT', 'HIGH', 'MEDIUM', 'LOW'],
    },
    entityType: {
      type: Schema.Types.String,
      enum: [
        'user',
        'client',
        'client-user',
        'debtor',
        'application',
        'claim',
        'overdue',
      ],
    },
    entityId: { type: Schema.Types.ObjectId },
    createdByType: {
      type: Schema.Types.String,
      enum: ['user', 'client-user', 'system'],
    },
    createdById: { type: Schema.Types.ObjectId },
    assigneeType: { type: Schema.Types.String, enum: ['user', 'client-user'] },
    assigneeId: { type: Schema.Types.ObjectId },
    dueDate: { type: Schema.Types.Date },
    isCompleted: { type: Schema.Types.Boolean, default: false },
    isDeleted: { type: Schema.Types.Boolean, default: false },
  },
  { timestamps: true },
);

taskSchema.plugin(pagination);

/**
 * Export Schema
 */
module.exports = mongoose.model('task', taskSchema);
