/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const Application = mongoose.model('application');
const Organization = mongoose.model('organization');
const Debtor = mongoose.model('debtor');
const Client = mongoose.model('client');
const Policy = mongoose.model('policy');
const DebtorDirector = mongoose.model('debtor-director');
const ClientDebtor = mongoose.model('client-debtor');
const Note = mongoose.model('note');
const User = mongoose.model('user');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const { createDebtor } = require('./debtor.helper');
const {
  checkEntityType,
  identifyInsurer,
  insurerQBE,
  insurerBond,
  insurerTrad,
  insurerEuler,
  insurerCoface,
  insurerAtradius,
} = require('./automation.helper');
const {
  getEntityDetailsByABN,
  getEntityDetailsByNZBN,
} = require('./abr.helper');
const { addAuditLog } = require('./audit-log.helper');
const { storeStakeholderDetails } = require('./stakeholder.helper');
const { createTask } = require('./task.helper');
const { addNotification } = require('./notification.helper');
const { sendNotification } = require('./socket.helper');
const { formatString } = require('./overdue.helper');

//TODO add filter for expiry-date + credit-limit
const getApplicationList = async ({
  applicationColumn,
  requestedQuery,
  isForRisk = true,
  hasFullAccess = false,
  queryFilter = {},
  clientIds = [],
  moduleColumn,
  userId,
  isForDownload = false,
}) => {
  try {
    let query = [];
    const filterArray = [];
    let sortingOptions = {};
    requestedQuery.sortBy = requestedQuery.sortBy || '_id';
    requestedQuery.sortOrder = requestedQuery.sortOrder || 'desc';

    queryFilter.isDeleted = false;
    if (requestedQuery.clientId) {
      requestedQuery.clientId = requestedQuery.clientId
        .split(',')
        .map((id) => mongoose.Types.ObjectId(id));
      if (isForDownload) {
        const client = await Client.findOne({ _id: requestedQuery.clientId })
          .select('name')
          .lean();
        filterArray.push({
          label: 'Client',
          value: client && client.name ? client.name : '',
          type: 'string',
        });
      }
    } else if (userId) {
      queryFilter = Object.assign({}, queryFilter, {
        $or: [
          { status: { $ne: 'DRAFT' } },
          { createdById: mongoose.Types.ObjectId(userId), status: 'DRAFT' },
        ],
      });
    } else if (!hasFullAccess && isForRisk && clientIds.length !== 0) {
      queryFilter.clientId = { $in: clientIds };
    }
    if (requestedQuery.search) {
      queryFilter.applicationId = {
        $regex: `${requestedQuery.search}`,
        $options: 'i',
      };
    }
    if (requestedQuery.status) {
      queryFilter.status = requestedQuery.status;
      if (isForDownload) {
        filterArray.push({
          label: 'Application Status',
          value: formatString(requestedQuery.status),
          type: 'string',
        });
      }
    }
    if (requestedQuery.clientId || applicationColumn.includes('clientId')) {
      query.push(
        {
          $lookup: {
            from: 'clients',
            localField: 'clientId',
            foreignField: '_id',
            as: 'clientId',
          },
        },
        {
          $unwind: {
            path: '$clientId',
          },
        },
      );
    }
    if (requestedQuery.clientId) {
      query.push({
        $match: {
          'clientId._id': { $in: requestedQuery.clientId },
        },
      });
    }
    if (requestedQuery.debtorId) {
      requestedQuery.debtorId = requestedQuery.debtorId
        .split(',')
        .map((id) => mongoose.Types.ObjectId(id));
      if (isForDownload) {
        const debtor = await Debtor.findOne({ _id: requestedQuery.debtorId })
          .select('entityName')
          .lean();
        filterArray.push({
          label: 'Debtor',
          value: debtor && debtor.entityName ? debtor.entityName : '',
          type: 'string',
        });
      }
    }
    if (
      requestedQuery.debtorId ||
      applicationColumn.includes('debtorId') ||
      applicationColumn.includes('entityType') ||
      requestedQuery.entityType
    ) {
      query.push(
        {
          $lookup: {
            from: 'debtors',
            localField: 'debtorId',
            foreignField: '_id',
            as: 'debtorId',
          },
        },
        {
          $unwind: {
            path: '$debtorId',
          },
        },
      );
    }

    if (applicationColumn.includes('createdById')) {
      query.push(
        {
          $addFields: {
            clientUserId: {
              $cond: [
                { $eq: ['$createdByType', 'client-user'] },
                '$createdById',
                null,
              ],
            },
            userId: {
              $cond: [
                { $eq: ['$createdByType', 'user'] },
                '$createdById',
                null,
              ],
            },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            as: 'userId',
          },
        },
        {
          $lookup: {
            from: 'clients',
            localField: 'clientUserId',
            foreignField: '_id',
            as: 'clientUserId',
          },
        },
        {
          $addFields: {
            createdById: {
              $cond: [
                { $eq: ['$createdByType', 'client-user'] },
                '$clientUserId.name',
                '$userId.name',
              ],
            },
          },
        },
      );
    }

    if (requestedQuery.debtorId) {
      query.push({
        $match: {
          'debtorId._id': { $in: requestedQuery.debtorId },
        },
      });
    }
    if (requestedQuery.entityType) {
      query.push({
        $match: {
          'debtorId.entityType': requestedQuery.entityType,
        },
      });
      if (isForDownload) {
        filterArray.push({
          label: 'Debtor Entity Type',
          value: formatString(requestedQuery.entityType),
          type: 'string',
        });
      }
    }

    /*if (applicationColumn.includes('outstandingAmount')) {
      query.push(
        {
          $lookup: {
            from: 'client-debtors',
            localField: 'clientDebtorId',
            foreignField: '_id',
            as: 'clientDebtorId',
          },
        },
        {
          $unwind: {
            path: '$clientDebtorId',
          },
        },
      );
    }*/

    if (requestedQuery.minCreditLimit || requestedQuery.maxCreditLimit) {
      let limitQuery = {};
      if (requestedQuery.minCreditLimit) {
        limitQuery = {
          $gte: parseInt(requestedQuery.minCreditLimit),
        };
        if (isForDownload) {
          filterArray.push({
            label: 'Minimum Credit Limit',
            value: parseInt(requestedQuery.minCreditLimit),
            type: 'amount',
          });
        }
      }
      if (requestedQuery.maxCreditLimit) {
        limitQuery = Object.assign({}, limitQuery, {
          $lt: parseInt(requestedQuery.maxCreditLimit),
        });
        if (isForDownload) {
          filterArray.push({
            label: 'Maximum Credit Limit',
            value: parseInt(requestedQuery.maxCreditLimit),
            type: 'amount',
          });
        }
      }
      queryFilter.creditLimit = limitQuery;
      /*query.push({
        $match: {
          creditLimit: {
            $gte: parseInt(requestedQuery.minCreditLimit),
            $lt: parseInt(requestedQuery.maxCreditLimit),
          },
        },
      });*/
    }

    if (requestedQuery.startDate || requestedQuery.endDate) {
      let dateQuery = {};
      if (requestedQuery.startDate) {
        dateQuery = {
          $gte: new Date(requestedQuery.startDate),
        };
        if (isForDownload) {
          filterArray.push({
            label: 'Start Date',
            value: requestedQuery.startDate,
            type: 'date',
          });
        }
      }
      if (requestedQuery.endDate) {
        dateQuery = Object.assign({}, dateQuery, {
          $lte: new Date(requestedQuery.endDate),
        });
        if (isForDownload) {
          filterArray.push({
            label: 'End Date',
            value: requestedQuery.endDate,
            type: 'date',
          });
        }
      }
      queryFilter.expiryDate = dateQuery;
    }

    const fields = applicationColumn.map((i) => {
      if (i === 'debtorId') {
        i = i + '.entityName';
      }
      if (i === 'entityType') {
        i = 'debtorId.' + i;
      }
      return [i, 1];
    });
    if (applicationColumn.includes('debtorId')) {
      fields.push(['debtorId._id', 1]);
    }
    query.push({
      $project: fields.reduce((obj, [key, val]) => {
        obj[key] = val;
        return obj;
      }, {}),
    });

    if (requestedQuery.sortBy && requestedQuery.sortOrder) {
      if (requestedQuery.sortBy === 'clientId') {
        requestedQuery.sortBy = requestedQuery.sortBy + '.name';
      }
      if (requestedQuery.sortBy === 'debtorId') {
        requestedQuery.sortBy = requestedQuery.sortBy + '.entityName';
      }
      if (requestedQuery.sortBy === 'entityType') {
        requestedQuery.sortBy = 'debtorId.' + requestedQuery.sortBy;
      }
      sortingOptions[requestedQuery.sortBy] =
        requestedQuery.sortOrder === 'desc' ? -1 : 1;
      query.push({ $sort: sortingOptions });
    }

    if (requestedQuery.page && requestedQuery.limit) {
      query.push({
        $facet: {
          paginatedResult: [
            {
              $skip:
                (parseInt(requestedQuery.page) - 1) *
                parseInt(requestedQuery.limit),
            },
            { $limit: parseInt(requestedQuery.limit) },
          ],
          totalCount: [
            {
              $count: 'count',
            },
          ],
        },
      });
    }
    query.unshift({ $match: queryFilter });

    const applications = await Application.aggregate(query).allowDiskUse(true);

    const response =
      applications && applications[0] && applications[0]['paginatedResult']
        ? applications[0]['paginatedResult']
        : applications;

    const total =
      applications.length !== 0 &&
      applications[0]['totalCount'] &&
      applications[0]['totalCount'].length !== 0
        ? applications[0]['totalCount'][0]['count']
        : 0;

    if (response && response.length !== 0) {
      response.forEach((application) => {
        if (applicationColumn.includes('entityType')) {
          application.entityType = formatString(
            application.debtorId.entityType,
          );
        }
        if (applicationColumn.includes('status')) {
          application.status = formatString(application.status);
        }
        if (applicationColumn.includes('clientId')) {
          application.clientId = {
            id: application.clientId._id,
            value: application.clientId.name,
          };
        }
        if (applicationColumn.includes('debtorId')) {
          application.debtorId = {
            id: application.debtorId._id,
            value: application.debtorId.entityName,
          };
        }
        /*if (applicationColumn.includes('outstandingAmount')) {
          application.outstandingAmount =
            application.clientDebtorId.outstandingAmount;
        }*/
        if (!applicationColumn.includes('debtorId')) {
          delete application.debtorId;
        }
        if (applicationColumn.includes('createdById')) {
          application.createdById =
            application.createdById && application.createdById[0]
              ? application.createdById[0]
              : '';
        }
        if (application.hasOwnProperty('isExtendedPaymentTerms')) {
          application.isExtendedPaymentTerms = application.isExtendedPaymentTerms
            ? 'Yes'
            : 'No';
        }
        if (application.hasOwnProperty('isPassedOverdueAmount')) {
          application.isPassedOverdueAmount = application.isPassedOverdueAmount
            ? 'Yes'
            : 'No';
        }
        delete application.clientDebtorId;
      });
    }
    const headers = [];
    for (let i = 0; i < moduleColumn.length; i++) {
      if (applicationColumn.includes(moduleColumn[i].name)) {
        headers.push(moduleColumn[i]);
      }
    }
    const applicationResponse = {
      docs: response,
      headers,
      total,
      page: parseInt(requestedQuery.page),
      limit: parseInt(requestedQuery.limit),
      pages: Math.ceil(total / parseInt(requestedQuery.limit)),
      filterArray,
    };
    if (isForDownload) {
      applicationResponse.filterArray = filterArray;
    }
    return applicationResponse;
  } catch (e) {
    Logger.log.error('Error occurred in get aggregation stages ', e);
  }
};

//TODO verify ABN & ACN
const storeCompanyDetails = async ({
  requestBody,
  createdBy,
  createdByType,
  createdByName,
  clientId,
}) => {
  try {
    const organization = await Organization.findOne({ isDeleted: false })
      .select('entityCount')
      .lean();
    const client = await Client.findOne({ _id: clientId }).lean();
    let isDebtorExists = true;
    let query;
    if (requestBody.registrationNumber) {
      query = { registrationNumber: requestBody.registrationNumber };
    } else if (requestBody.abn) {
      query = { abn: requestBody.abn };
    } else {
      query = { acn: requestBody.acn };
    }
    const debtorData = await Debtor.findOne(query).lean();
    if (!debtorData) {
      isDebtorExists = false;
    }
    if (!requestBody.applicationId) {
      if (debtorData) {
        const application = await Application.findOne({
          clientId: clientId,
          debtorId: debtorData._id,
          status: {
            $nin: [
              'DECLINED',
              'CANCELLED',
              'WITHDRAWN',
              'SURRENDERED',
              'APPROVED',
            ],
          },
        }).lean();
        if (application) {
          return {
            status: 'ERROR',
            messageCode: 'APPLICATION_ALREADY_EXISTS',
            message:
              'Application already exists, please create with another debtor',
          };
        }
      }
    }
    if (requestBody.address.country.code === 'AUS' && requestBody.abn) {
      const entityData = await getEntityDetailsByABN({
        searchString: requestBody.abn,
      });
      if (
        !entityData ||
        !entityData.response ||
        !entityData.response.businessEntity202001
      ) {
        return {
          status: 'ERROR',
          messageCode: 'INVALID_ABN_NUMBER',
          message: 'Invalid Australian Business Number',
        };
      }
    }
    if (requestBody.address.country.code === 'NZL' && requestBody.abn) {
      const entityData = await getEntityDetailsByNZBN({
        searchString: requestBody.abn,
      });
      if (!entityData || !entityData.nzbn || !entityData.entityName) {
        return {
          status: 'ERROR',
          messageCode: 'INVALID_NZBN_NUMBER',
          message: 'Invalid New Zealand Business Number',
        };
      }
    }
    const { debtor, clientDebtor } = await createDebtor({
      requestBody,
      organization,
      isDebtorExists,
      userId: createdBy,
      userName: createdByName,
      clientId,
    });
    const applicationDetails = {
      clientId: clientId,
      debtorId: debtor._id,
      clientDebtorId: clientDebtor._id,
      applicationStage: 1,
    };
    let application;
    if (requestBody.applicationId) {
      application = await Application.findById(
        requestBody.applicationId,
      ).lean();
    }
    if (!requestBody.applicationId) {
      applicationDetails.applicationId =
        client.clientCode +
        '-' +
        debtor.debtorCode +
        '-' +
        new Date().toISOString().split('T')[0].replace(/-/g, '') +
        '-' +
        (organization.entityCount.application + 1).toString().padStart(3, '0');
      await Organization.updateOne(
        { isDeleted: false },
        { $inc: { 'entityCount.application': 1 } },
      );
      applicationDetails.createdById = createdBy;
      applicationDetails.createdByType = createdByType;
      application = await Application.create(applicationDetails);
    } else {
      if (application.applicationId) {
        const previousId = application.applicationId.split('-');
        applicationDetails.applicationId =
          client.clientCode +
          '-' +
          debtor.debtorCode +
          '-' +
          previousId[2] +
          '-' +
          previousId[3];
      }
      await Application.updateOne(
        { _id: requestBody.applicationId },
        applicationDetails,
      );
      application = await Application.findById(requestBody.applicationId)
        .select('_id applicationStage')
        .lean();
      if (!application) {
        return {
          status: 'ERROR',
          messageCode: 'NO_APPLICATION_FOUND',
          message: 'No application found',
        };
      }
    }
    const partners = await DebtorDirector.find({
      debtorId: debtor._id,
      isDeleted: false,
    })
      .select({ __v: 0, updatedAt: 0, createdAt: 0, isDeleted: 0 })
      .lean();
    partners.forEach((data) => {
      data.isDisabled = true;
    });
    application.partners = partners;
    return application;
  } catch (e) {
    Logger.log.error('Error occurred in store company details ', e);
  }
};

const storePartnerDetails = async ({ requestBody }) => {
  try {
    const applicationData = await Application.findById(
      requestBody.applicationId,
    ).lean();
    if (!applicationData) {
      return {
        status: 'ERROR',
        messageCode: 'NO_APPLICATION_FOUND',
        message: 'No application exists',
      };
    }
    let individualCount = 0;
    let companyCount = 0;
    requestBody.partners.forEach((data) =>
      data.type.toLowerCase() === 'company'
        ? companyCount++
        : individualCount++,
    );
    const isValidate = partnerDetailsValidation({
      entityType: requestBody.entityType,
      individualCount,
      companyCount,
    });
    if (!isValidate) {
      return {
        status: 'ERROR',
        messageCode: 'INSUFFICIENT_DATA',
        message: 'Insufficient partners details',
      };
    }
    const promises = [];
    for (let i = 0; i < requestBody.partners.length; i++) {
      if (requestBody.partners[i].type.toLowerCase() === 'individual') {
        if (
          !requestBody.partners[i].title ||
          !requestBody.partners[i].firstName ||
          !requestBody.partners[i].lastName ||
          (!requestBody.partners[i].dateOfBirth &&
            !requestBody.partners[i].driverLicenceNumber) ||
          !requestBody.partners[i].address ||
          !requestBody.partners[i].address.state ||
          !requestBody.partners[i].address.postCode ||
          !requestBody.partners[i].address.streetNumber
        ) {
          return {
            status: 'ERROR',
            messageCode: 'REQUIRE_FIELD_MISSING',
            message: 'Require fields are missing',
          };
        }
        const { query, update, unsetFields } = await storeStakeholderDetails({
          debtorId: applicationData.debtorId,
          stakeholder: requestBody.partners[i],
        });
        promises.push(
          DebtorDirector.updateOne(
            query,
            { $set: update, $unset: unsetFields },
            { upsert: true },
          ),
        );
      } else {
        if (
          !requestBody.partners[i].entityName ||
          !requestBody.partners[i].entityType ||
          (!requestBody.partners[i].abn &&
            !requestBody.partners[i].acn &&
            !requestBody.partners[i].registrationNumber)
        ) {
          return {
            status: 'ERROR',
            messageCode: 'REQUIRE_FIELD_MISSING',
            message: 'Require fields are missing',
          };
        }
        const { query, update, unsetFields } = await storeStakeholderDetails({
          debtorId: applicationData.debtorId,
          stakeholder: requestBody.partners[i],
        });
        promises.push(
          DebtorDirector.updateOne(
            query,
            { $set: update, $unset: unsetFields },
            { upsert: true },
          ),
        );
      }
    }
    promises.push(
      Application.updateOne(
        { _id: requestBody.applicationId },
        { applicationStage: 2 },
      ),
    );
    await Promise.all(promises);
    const application = await Application.findById(requestBody.applicationId)
      .select('_id applicationStage')
      .lean();
    return application;
  } catch (e) {
    Logger.log.error('Error occurred in store partners details ', e);
  }
};

const storeCreditLimitDetails = async ({
  requestBody,
  createdBy,
  createdByType,
}) => {
  try {
    let application = await Application.findById(requestBody.applicationId)
      .populate({ path: 'debtorId', select: 'entityType' })
      .select('_id applicationStage debtorId')
      .lean();
    const entityTypes = ['TRUST', 'PARTNERSHIP'];
    const update = {
      creditLimit: requestBody.creditLimit,
      isExtendedPaymentTerms: requestBody.isExtendedPaymentTerms,
      isPassedOverdueAmount: requestBody.isPassedOverdueAmount,
      applicationStage: !entityTypes.includes(application.debtorId.entityType)
        ? 2
        : 3,
    };
    update.outstandingAmount = requestBody.outstandingAmount
      ? requestBody.outstandingAmount
      : undefined;
    update.orderOnHand = requestBody.orderOnHand
      ? requestBody.orderOnHand
      : undefined;
    update.note = requestBody.note ? requestBody.note : '';
    update.extendedPaymentTermsDetails = requestBody.extendedPaymentTermsDetails
      ? requestBody.extendedPaymentTermsDetails
      : '';
    update.passedOverdueDetails = requestBody.passedOverdueDetails
      ? requestBody.passedOverdueDetails
      : '';
    if (requestBody.note) {
      const note = await Note.findOne({
        noteFor: 'application',
        isDeleted: false,
        entityId: requestBody.applicationId,
      }).lean();
      if (note) {
        await Note.updateOne(
          { _id: note._id },
          { description: requestBody.note },
        );
      } else {
        await Note.create({
          description: requestBody.note,
          noteFor: 'application',
          entityId: requestBody.applicationId,
          createdByType: createdByType,
          createdById: createdBy,
        });
      }
    } else {
      await Note.updateOne(
        {
          noteFor: 'application',
          isDeleted: false,
          entityId: requestBody.applicationId,
        },
        { isDeleted: true },
      );
    }
    await Application.updateOne({ _id: requestBody.applicationId }, update);
    application = await Application.findById(requestBody.applicationId)
      .select('_id applicationStage')
      .lean();
    return application;
  } catch (e) {
    Logger.log.error(
      'Error occurred in store credit-limit details ',
      e.message || e,
    );
  }
};

const partnerDetailsValidation = ({
  entityType,
  individualCount,
  companyCount,
}) => {
  try {
    let response = false;
    switch (entityType) {
      case 'PROPRIETARY_LIMITED':
      case 'LIMITED_COMPANY':
        response = individualCount >= 1 && companyCount === 0;
        break;
      case 'PARTNERSHIP':
        response =
          individualCount >= 2 ||
          (individualCount >= 1 && companyCount >= 1) ||
          companyCount >= 2;
        break;
      case 'SOLE_TRADER':
        response = individualCount === 1 && companyCount === 0;
        break;
      case 'TRUST':
        response = individualCount >= 1 || companyCount >= 1;
        break;
      case 'BUSINESS':
      case 'CORPORATION':
      case 'GOVERNMENT':
      case 'INCORPORATED':
      case 'NO_LIABILITY':
      case 'PROPRIETARY':
      case 'REGISTERED_BODY':
        response = individualCount >= 1 && companyCount === 0;
        break;
    }
    return response;
  } catch (e) {
    Logger.log.error(
      'Error occurred in partner details validation',
      e.message || e,
    );
  }
};

const checkForAutomation = async ({ applicationId, userId, userType }) => {
  try {
    const application = await Application.findById(applicationId)
      .populate({ path: 'clientId', populate: { path: 'insurerId' } })
      .populate('debtorId clientDebtorId')
      .lean();
    let continueWithAutomation = true;
    let blockers = [];

    //TODO uncomment after flag added in client
    if (!application.clientId.isAutoApproveAllowed) {
      continueWithAutomation = false;
      blockers.push('Automation is not Allowed');
    }

    if (
      continueWithAutomation &&
      application.debtorId.address &&
      application.debtorId.address.country
    ) {
      if (
        application.debtorId.address.country.code !== 'AUS' &&
        application.debtorId.address.country.code !== 'NZL'
      ) {
        continueWithAutomation = false;
        blockers.push('Foreign Buyer');
      }
    }

    const policy = {};
    if (continueWithAutomation) {
      //TODO check product type base on flag/field (RMP/CI)
      const [ciPolicy, rmpPolicy] = await Promise.all([
        Policy.findOne({
          clientId: application.clientId,
          product: { $regex: '.*Credit Insurance.*' },
          inceptionDate: { $lte: new Date() },
          expiryDate: { $gt: new Date() },
        })
          .select(
            'clientId product policyPeriod excess discretionaryLimit inceptionDate expiryDate',
          )
          .lean(),
        Policy.findOne({
          clientId: application.clientId,
          $or: [
            { product: { $regex: '.*Risk Management Package.*' } },
            { product: { $regex: '.*Risk Management.*' } },
          ],
          inceptionDate: { $lte: new Date() },
          expiryDate: { $gt: new Date() },
        })
          .select(
            'clientId product policyPeriod excess discretionaryLimit inceptionDate expiryDate',
          )
          .lean(),
      ]);
      if (!rmpPolicy) {
        continueWithAutomation = false;
        blockers.push('No RMP policy found');
      }
      if (!ciPolicy) {
        continueWithAutomation = false;
        blockers.push('No CI policy found');
      }
      let discretionaryLimit;
      if (continueWithAutomation) {
        if (ciPolicy.discretionaryLimit || rmpPolicy.discretionaryLimit) {
          discretionaryLimit =
            ciPolicy.discretionaryLimit || rmpPolicy.discretionaryLimit;
          policy['discretionaryLimit'] = discretionaryLimit
            ? parseInt(discretionaryLimit)
            : '';
          policy['excess'] = ciPolicy.excess
            ? parseInt(ciPolicy.excess)
            : rmpPolicy.excess
            ? parseInt(rmpPolicy.excess)
            : '';
          console.log('discretionaryLimit ', discretionaryLimit);
        }
        if (
          discretionaryLimit &&
          parseInt(discretionaryLimit) < parseInt(application.creditLimit)
        ) {
          continueWithAutomation = false;
          blockers.push('Credit limit is greater than Discretionary limit');
        }
      }
    }

    let type;
    if (continueWithAutomation) {
      const response = await checkEntityType({
        debtorId: application.debtorId._id,
        entityType: application.debtorId.entityType,
        blockers,
      });
      continueWithAutomation = response.continueWithAutomation;
      blockers = response.blockers;
      type = response.type;
    }
    console.log('continueWithAutomation', continueWithAutomation);
    console.log('blockers', blockers);
    let identifiedInsurer;
    if (continueWithAutomation) {
      identifiedInsurer = await identifyInsurer({
        insurerName: application.clientId.insurerId.name,
      });
      console.log('identifiedInsurer ', identifiedInsurer);
      let response;
      if (!identifiedInsurer) {
        blockers.push('No insurer found');
      }
      if (identifiedInsurer === 'qbe') {
        response = await insurerQBE({ application, type: type, policy });
      } else if (identifiedInsurer === 'bond') {
        response = await insurerBond({ application, type: type, policy });
      } else if (identifiedInsurer === 'atradius') {
        response = await insurerAtradius({ application, type: type, policy });
      } else if (identifiedInsurer === 'coface') {
        response = await insurerCoface({ application, type: type, policy });
      } else if (identifiedInsurer === 'euler') {
        response = await insurerEuler({ application, type: type, policy });
      } else if (identifiedInsurer === 'trad') {
        blockers.push('RMP only insurer');
        response = await insurerTrad({ application, type: type, policy });
      }
      blockers = blockers.concat(response);
    }
    const update = {};
    update.blockers = blockers;
    const date = new Date();
    if (blockers.length === 0 && identifiedInsurer !== 'euler') {
      //TODO approve credit limit
      update.approvalDate = date;
      const expiryDate = new Date(date.setMonth(date.getMonth() + 12));
      update.expiryDate = expiryDate;
      update.status = 'APPROVED';
      update.acceptedAmount = application.creditLimit;
      update.isAutoApproved = true;
      await ClientDebtor.updateOne(
        { _id: application.clientDebtorId._id },
        {
          creditLimit: application.creditLimit,
          isEndorsedLimit: false,
          activeApplicationId: applicationId,
          expiryDate: expiryDate,
        },
      );
      //TODO send notification
      sendNotificationsToUser({
        application,
        userType,
        userId,
        status: 'APPROVED',
      });
    } else {
      //TODO create Task + send Notification
      update.status = 'REVIEW_APPLICATION';
      sendNotificationsToUser({
        application,
        userType,
        userId,
        status: 'REVIEW_APPLICATION',
      });
    }
    //TODO notify user
    await Application.updateOne({ _id: applicationId }, update);
  } catch (e) {
    Logger.log.error('Error occurred in check for automation ', e);
  }
};

const generateNewApplication = async ({
  clientDebtorId,
  createdByType,
  createdById,
  creditLimit,
}) => {
  try {
    const application = await Application.findOne({
      clientDebtorId: clientDebtorId,
      status: 'APPROVED',
    })
      .populate('clientId debtorId')
      .lean();
    if (application) {
      const organization = await Organization.findOne({ isDeleted: false })
        .select('entityCount')
        .lean();
      const applicationDetails = {
        clientId: application.clientId._id,
        debtorId: application.debtorId._id,
        clientDebtorId: clientDebtorId,
        applicationStage: application.applicationStage,
        creditLimit: creditLimit,
        isExtendedPaymentTerms: application.isExtendedPaymentTerms,
        isPassedOverdueAmount: application.isPassedOverdueAmount,
        extendedPaymentTermsDetails: application.extendedPaymentTermsDetails,
        passedOverdueDetails: application.passedOverdueDetails,
        note: application.note,
        createdByType: createdByType,
        createdById: createdById,
        status: 'SUBMITTED',
      };
      applicationDetails.applicationId =
        application.clientId.clientCode +
        '-' +
        application.debtorId.debtorCode +
        '-' +
        new Date().toISOString().split('T')[0].replace(/-/g, '') +
        '-' +
        (organization.entityCount.application + 1).toString().padStart(3, '0');
      await Organization.updateOne(
        { isDeleted: false },
        { $inc: { 'entityCount.application': 1 } },
      );
      const application = await Application.create(applicationDetails);
      checkForAutomation({
        applicationId: application._id,
        userId: createdById,
        userType: createdByType,
      });
      //TODO call application automation helper
    }
    return application;
  } catch (e) {
    Logger.log.error('Error occurred in generate application', e.message || e);
  }
};

const applicationDrawerDetails = async ({ application, manageColumns }) => {
  try {
    let createdBy;
    if (application.createdByType === 'client-user') {
      createdBy = await Client.findOne({ _id: application.createdById })
        .select('name')
        .lean();
    } else {
      createdBy = await User.findOne({ _id: application.createdById })
        .select('name')
        .lean();
    }
    let response = [];
    let value = '';
    manageColumns.forEach((i) => {
      value =
        i.name === 'clientId'
          ? application['clientId']['name']
          : i.name === 'debtorId'
          ? application['debtorId']['entityName']
          : i.name === 'entityType'
          ? application['debtorId'][i.name]
          : i.name === 'createdById'
          ? createdBy['name']
          : i.name === 'isExtendedPaymentTerms' ||
            i.name === 'isPassedOverdueAmount'
          ? application[i.name]
            ? 'Yes'
            : 'No'
          : application[i.name]
          ? application[i.name]
          : '';
      if (i.name === 'status' || i.name === 'entityType') {
        value = formatString(value);
      }
      response.push({
        label: i.label,
        value: value,
        type: i.type,
      });
    });
    return response;
  } catch (e) {
    Logger.log.error('Error occurred in get application drawer details', e);
  }
};

const sendNotificationsToUser = async ({
  application,
  userId,
  userType,
  userName = null,
  status,
}) => {
  try {
    if (status === 'APPROVED') {
      await addAuditLog({
        entityType: 'application',
        entityRefId: application._id,
        actionType: 'edit',
        userType: 'system',
        logDescription: `An application ${application.applicationId} is being approved`,
      });
      if (application.clientId && application.clientId._id) {
        const clientNotification = await addNotification({
          userId: application.clientId._id,
          userType: 'client-user',
          description: `An application ${application.applicationId} is being approved`,
        });
        if (clientNotification) {
          sendNotification({
            notificationObj: {
              type: 'APPLICATION_APPROVED',
              data: clientNotification,
            },
            type: 'client-user',
            userId: application.clientId._id,
          });
        }
      }
      if (application.clientId && application.clientId.riskAnalystId) {
        const userNotification = await addNotification({
          userId: application.clientId.riskAnalystId,
          userType: 'user',
          description: `A new application ${application.applicationId} is being approved`,
        });
        if (userNotification) {
          sendNotification({
            notificationObj: {
              type: 'APPLICATION_APPROVED',
              data: userNotification,
            },
            type: 'user',
            userId: application.clientId.riskAnalystId,
          });
        }
      }
    } else if (
      status === 'REVIEW_APPLICATION' &&
      application.clientId &&
      application.clientId.riskAnalystId
    ) {
      const date = new Date();
      const data = {
        title: `Review Application ${application.applicationId}`,
        createdByType: userType,
        createdById: userId,
        assigneeType: 'user',
        assigneeId: application.clientId.riskAnalystId,
        dueDate: new Date(date.setDate(date.getDate() + 7)),
        entityType: 'application',
        entityId: application._id,
      };
      const task = await createTask(data);
      await addAuditLog({
        entityType: 'task',
        entityRefId: task._id,
        actionType: 'add',
        userType: userType,
        userRefId: userId,
        logDescription: `A new task for ${application.applicationId} is created by system`,
      });
      const notification = await addNotification({
        userId: task.assigneeId,
        userType: task.assigneeType,
        description: `A new task ${task.title} is assigned by system`,
      });
      if (notification) {
        sendNotification({
          notificationObj: {
            type: 'TASK_ASSIGNED',
            data: notification,
          },
          type: task.assigneeType,
          userId: task.assigneeId,
        });
      }
    } else if (status === 'DECLINED') {
      await addAuditLog({
        entityType: 'application',
        entityRefId: application._id,
        actionType: 'edit',
        userType: 'system',
        logDescription: `An application ${application.applicationId} is being declined by ${userName}`,
      });
      if (application.clientId && application.clientId._id) {
        const clientNotification = await addNotification({
          userId: application.clientId._id,
          userType: 'client-user',
          description: `An application ${application.applicationId} is being declined by ${userName}`,
        });
        if (clientNotification) {
          sendNotification({
            notificationObj: {
              type: 'APPLICATION_DECLINED',
              data: clientNotification,
            },
            type: 'client-user',
            userId: application.clientId._id,
          });
        }
      }
    }
  } catch (e) {
    Logger.log.error('Error occurred in send notifications');
    Logger.log.error(e.message || e);
  }
};

module.exports = {
  getApplicationList,
  storeCompanyDetails,
  storePartnerDetails,
  storeCreditLimitDetails,
  partnerDetailsValidation,
  checkForAutomation,
  generateNewApplication,
  applicationDrawerDetails,
  sendNotificationsToUser,
};
