/*
 * Module Imports
 * */
const fs = require('fs');
const mongoose = require('mongoose');
const Client = mongoose.model('client');
const Debtor = mongoose.model('debtor');
const Organization = mongoose.model('organization');
const DebtorDirector = mongoose.model('debtor-director');
const ClientDebtor = mongoose.model('client-debtor');
const Note = mongoose.model('note');
const Application = mongoose.model('application');
const moment = require('moment');

/*
 * Local Imports
 * */
const StaticData = require('./static-files/staticData.json');
const unProcessedApplicationIds = [];
let processedApplicationCount = 0;

let applicationList = fs.readFileSync('application-list-filtered.json');
applicationList = JSON.parse(applicationList.toString());
console.log('Total Application..........', Object.keys(applicationList).length);

let companyList = fs.readFileSync('company-list.json');
companyList = JSON.parse(companyList.toString());

let individualList = fs.readFileSync('individual-list.json');
individualList = JSON.parse(individualList.toString());

let addressList = fs.readFileSync('address-list.json');
addressList = JSON.parse(addressList.toString());

let questionAnswerList = fs.readFileSync('question-answer.json');
questionAnswerList = JSON.parse(questionAnswerList.toString());

let notes = fs.readFileSync('notes.json');
notes = JSON.parse(notes.toString());

let applicationApprovalDetails = fs.readFileSync(
  'application-approval-details.json',
);
applicationApprovalDetails = JSON.parse(applicationApprovalDetails.toString());

let applicationDetails = fs.readFileSync('application-details.json');
applicationDetails = JSON.parse(applicationDetails.toString());

const storeMerchantCode = async () => {
  try {
    let clientList = fs.readFileSync('client.json');
    clientList = clientList.toString();
    clientList = JSON.parse(clientList);

    const clients = await Client.find().lean();
    const promises = [];
    const remaining = [];
    clientList.forEach((i) => {
      const client = clients.find((client) => {
        return (
          i['Client Name'].toLowerCase().includes(client.name.toLowerCase()) ||
          client.name.toLowerCase().includes(i['Client Name'].toLowerCase())
        );
      });
      // console.log('found:', client);
      if (client) {
        // promises.push(
        //   Client.updateOne(
        //     { _id: client._id },
        //     { $unset: { merchantCode: 1 } },
        //   ),
        // );
        promises.push(
          Client.updateOne(
            { _id: client._id },
            { $addToSet: { merchantCode: i['Merchant Code'] } },
          ),
        );
      } else {
        remaining.push(i);
      }
    });
    await Promise.all(promises);
    console.log('remaining', remaining);
    // fs.writeFileSync(
    //   'remaining-client-list.json',
    //   JSON.stringify(remaining, null, 2),
    // );
  } catch (e) {
    console.log('Error occurred', e);
  }
};

const entityTypes = ({ entityType }) => {
  try {
    switch (entityType) {
      case 'P/L':
        entityType = 'PROPRIETARY_LIMITED';
        break;
      case 'TRST':
        entityType = 'TRUST';
        break;
      case 'PTNR':
        entityType = 'PARTNERSHIP';
        break;
      case 'SLTR':
        entityType = 'SOLE_TRADER';
        break;
      case 'LTD':
        entityType = 'LIMITED';
        break;
      case 'CORP':
        entityType = 'CORPORATION';
        break;
      case 'INC':
        entityType = 'INCORPORATED';
        break;
      case 'BUS':
        entityType = 'BUSINESS';
        break;
      case 'GOVT':
        entityType = 'GOVERNMENT';
        break;
      case 'N/L':
        entityType = 'NO_LIABILITY';
        break;
      case 'PTY':
        entityType = 'PROPRIETARY';
        break;
      case 'R/B':
        entityType = 'REGISTERED_BODY';
        break;
    }
    return entityType;
  } catch (e) {
    console.log('Error occurred in replace entity type', e);
  }
};

const countryList = ({ country }) => {
  try {
    switch (country) {
      case '61':
        country = {
          code: 'AUS',
          name: 'Australia',
        };
        break;
      case '64':
        country = {
          code: 'NZL',
          name: 'New Zealand',
        };
        break;
    }
    return country;
  } catch (e) {
    console.log('Error occurred in get country name', e);
  }
};

const entityAddress = ({
  applicationId,
  activeApplicationIndex,
  entityType,
}) => {
  try {
    const address = {
      property:
        addressList?.[applicationId]?.[activeApplicationIndex]?.[entityType]?.[
          'nm_property'
        ] || '',
      unitNumber:
        addressList?.[applicationId]?.[activeApplicationIndex]?.[entityType]?.[
          'tx_number_unit'
        ] || '',
      streetNumber:
        addressList?.[applicationId]?.[activeApplicationIndex]?.[entityType]?.[
          'tx_number_street'
        ] || '',
      streetName:
        addressList?.[applicationId]?.[activeApplicationIndex]?.[entityType]?.[
          'nm_street'
        ] || '',
      streetType:
        addressList?.[applicationId]?.[activeApplicationIndex]?.[entityType]?.[
          'cd_type_street'
        ] || '',
      suburb:
        addressList?.[applicationId]?.[activeApplicationIndex]?.[entityType]?.[
          'nm_suburb'
        ] || '',
      state:
        addressList?.[applicationId]?.[activeApplicationIndex]?.[entityType]?.[
          'cd_state'
        ] || '',
      postCode:
        addressList?.[applicationId]?.[activeApplicationIndex]?.[entityType]?.[
          'tx_postcode'
        ] || '',
    };
    let country = {
      code: 'AUS',
      name: 'Australia',
    };
    if (address?.streetType) {
      const streetType = StaticData.streetType.find((i) => {
        if (i._id === address.streetType.toUpperCase()) return i;
      });
      address.streetType =
        streetType && streetType.name
          ? streetType.name
          : address.streetType.toUpperCase();
    }
    if (
      addressList?.[applicationId]?.[activeApplicationIndex]?.[entityType]?.[
        'cd_country'
      ]
    ) {
      country = countryList({
        country:
          addressList[applicationId][activeApplicationIndex][entityType][
            'cd_country'
          ],
      });
    }
    if (country && entityType === 'Principal') {
      address.country = country;
    }
    return { address, country };
  } catch (e) {
    console.log('Error occurred in get entity address', e);
  }
};

const createDebtor = async ({ applicationId, activeApplicationIndex }) => {
  try {
    const foundDebtor =
      companyList?.[applicationId]?.[activeApplicationIndex]?.['Principal'] ||
      null;
    if (foundDebtor) {
      const abn =
        foundDebtor?.['tx_abn'] || foundDebtor?.['tx_company_nzbn'] || '';
      const acn =
        foundDebtor?.['tx_acn'] || foundDebtor?.['tx_company_no'] || '';
      const query = abn ? { abn: abn } : { acn: acn };
      // console.log('query',query)
      const existingDebtor = await Debtor.findOne(query).lean();
      if (!existingDebtor) {
        const organization = await Organization.findOne({ isDeleted: false })
          .select('entityCount')
          .lean();
        const debtorAddress = await entityAddress({
          applicationId,
          activeApplicationIndex,
          entityType: 'Principal',
        });
        const debtorDetails = {
          debtorCode:
            'D' +
            (organization.entityCount.debtor + 1).toString().padStart(4, '0'),
          isActive: true,
          abn: abn,
          acn: acn,
          entityType: entityTypes({
            entityType: foundDebtor['cd_type_entity'],
          }),
          entityName: foundDebtor['nm_legal'],
          tradingName: foundDebtor['nm_trading'],
          address: debtorAddress.address,
        };
        // debtorDetails.address = debtorAddress.address;
        // console.log('debtorDetails',debtorDetails)
        const debtor = Debtor.create(debtorDetails);
        await Organization.updateOne(
          { isDeleted: false },
          { $inc: { 'entityCount.debtor': 1 } },
        );
        return debtor;
      }
      return existingDebtor;
    } else {
      unProcessedApplicationIds.push({
        applicationId: applicationId,
        reason: 'Debtor not found',
        clientCode:
          applicationList[applicationId][activeApplicationIndex][
            'id_merchant_submit'
          ],
        date:
          applicationList?.[applicationId]?.[activeApplicationIndex]?.[
            'dt_modify'
          ],
      });
      return null;
    }
  } catch (e) {
    console.log('Error occurred in create debtor', e);
  }
};

const storeIndividual = async ({
  debtorId,
  applicationId,
  activeApplicationIndex,
  entityType,
}) => {
  try {
    const currentStakeholders =
      individualList[applicationId]?.[activeApplicationIndex];
    if (currentStakeholders && Object.keys(currentStakeholders).length !== 0) {
      let query;
      const promises = [];
      for (let key in currentStakeholders) {
        if (key.includes(entityType)) {
          query = {
            dateOfBirth: moment(
              currentStakeholders[key]['dt_dob'],
              'DD/MM/YYYY HH:mm:ss a',
            ).toISOString(),
            debtorId: debtorId,
            isDeleted: false,
            type: 'individual',
          };
          let existingStakeholder = await DebtorDirector.findOne(query).lean();
          if (!existingStakeholder) {
            //TODO add allowToCheckCreditHistory field
            const data = {
              type: 'individual',
              debtorId: debtorId,
              title: currentStakeholders[key]['cd_title'],
              firstName: currentStakeholders[key]['nm_firstname'],
              middleName: currentStakeholders[key]['nm_middlename'],
              lastName: currentStakeholders[key]['nm_surname'],
              dateOfBirth: moment(
                currentStakeholders[key]['dt_dob'],
                'DD/MM/YYYY HH:mm:ss a',
              ).toISOString(),
              residentialAddress: {},
            };
            const stakeholderAddress = await entityAddress({
              applicationId,
              activeApplicationIndex,
              entityType: key,
            });
            data.residentialAddress = stakeholderAddress?.address;
            data.country = stakeholderAddress?.country;
            promises.push(DebtorDirector.create(data));
          }
        }
      }
      await Promise.all(promises);
    }
  } catch (e) {
    console.log('Error occurred in store individual details', e);
  }
};

const storeCompany = async ({
  debtorId,
  applicationId,
  activeApplicationIndex,
  entityType,
}) => {
  try {
    const currentStakeholders =
      companyList[applicationId]?.[activeApplicationIndex];
    if (currentStakeholders && Object.keys(currentStakeholders).length !== 0) {
      let query;
      const promises = [];
      for (let key in currentStakeholders) {
        if (key.includes(entityType)) {
          const abn =
            currentStakeholders[key]?.['tx_abn'] ||
            currentStakeholders[key]?.['tx_company_nzbn'] ||
            '';
          const acn =
            currentStakeholders[key]?.['tx_acn'] ||
            currentStakeholders[key]?.['tx_company_no'] ||
            '';

          query = abn
            ? {
                abn: abn,
                debtorId: debtorId,
                isDeleted: false,
                type: 'company',
              }
            : {
                acn: acn,
                debtorId: debtorId,
                isDeleted: false,
                type: 'company',
              };

          const existingStakeholder = await DebtorDirector.findOne(
            query,
          ).lean();
          if (!existingStakeholder) {
            //TODO add allowToCheckCreditHistory field
            const data = {
              type: 'company',
              debtorId: debtorId,
              abn: abn,
              acn: acn,
              entityType: entityTypes({
                entityType: currentStakeholders[key]['cd_type_entity'],
              }),
              entityName: currentStakeholders[key]['nm_legal'],
              tradingName: currentStakeholders[key]['nm_trading'],
            };
            const stakeholderAddress = await entityAddress({
              applicationId,
              activeApplicationIndex,
              entityType: key,
            });
            data.residentialAddress = stakeholderAddress?.address;
            data.country = stakeholderAddress?.country;
            promises.push(DebtorDirector.create(data));
          }
        }
      }
      await Promise.all(promises);
    }
  } catch (e) {
    console.log('Error occurred in store company details', e);
  }
};

const createCreditLimit = async ({ debtorId, clientId, update }) => {
  try {
    await ClientDebtor.updateOne(
      { clientId: clientId, debtorId: debtorId },
      update,
      { upsert: true },
    );
    const clientDebtor = await ClientDebtor.findOne({
      clientId: clientId,
      debtorId: debtorId,
    }).lean();
    return clientDebtor;
  } catch (e) {
    console.log('Error occurred in create credit limit', e);
  }
};

const createNotes = async ({
  applicationNumber,
  activeApplicationIndex,
  applicationId,
}) => {
  try {
    const currentNotes = notes?.[applicationNumber]?.[activeApplicationIndex];
    const promises = [];
    for (let key in currentNotes) {
      promises.push(
        Note.create({
          noteFor: 'application',
          entityId: applicationId,
          description:
            currentNotes[key]['tx_subject'] +
            '\n' +
            currentNotes[key]['tx_note'],
          isPublic: true,
        }),
      );
    }
    await Promise.all(promises);
  } catch (e) {
    console.log('Error occurred in create notes', e);
  }
};

const mapApplicationStatus = ({ status }) => {
  try {
    switch (status) {
      case 'Approved':
        status = 'APPROVED';
        break;
      case 'Withdraw':
        status = 'WITHDRAWN';
        break;
      case 'Stored':
        status = 'SUBMITTED';
        break;
      case 'Refer':
        status = 'REVIEW_APPLICATION';
        break;
      case 'Nil Approved':
        status = 'DECLINED';
        break;
      case 'New App with Nil Amount':
        status = 'DECLINED';
        break;
      case 'Error':
        status = 'UNDER_REVIEW';
        break;
      case 'Assess':
        status = 'APPROVED';
        break;
      case 'Approved Amount Cancelled':
        status = 'CANCELLED';
        break;
      case 'Decline':
        status = 'DECLINED';
        break;
      case 'Cancelled':
        status = 'CANCELLED';
        break;
    }
    return status;
  } catch (e) {
    console.log('Error occurred in get application status', e);
  }
};

const importApplications = async () => {
  try {
    for (let key in applicationList) {
      const activeApplicationIndex = Math.max(
        ...Object.keys(applicationList[key]),
      );
      if (
        activeApplicationIndex &&
        applicationList[key][activeApplicationIndex]
      ) {
        const existingApplication = await Application.findOne({
          applicationId: key,
        }).lean();
        if (!existingApplication) {
          const client = await Client.findOne({
            merchantCode: {
              $in: [
                applicationList[key][activeApplicationIndex][
                  'id_merchant_submit'
                ],
              ],
            },
          }).lean();
          if (!client) {
            unProcessedApplicationIds.push({
              applicationId: key,
              reason: 'Client not found',
              clientCode:
                applicationList[key][activeApplicationIndex][
                  'id_merchant_submit'
                ],
              applicationDate:
                applicationList[key][activeApplicationIndex]?.['dt_modify'],
            });
          } else {
            const debtor = await createDebtor({
              applicationId: key,
              activeApplicationIndex,
            });
            if (debtor) {
              if (
                debtor?.entityType === 'TRUST' ||
                debtor?.entityType === 'PARTNERSHIP'
              ) {
                await Promise.all([
                  await storeIndividual({
                    debtorId: debtor._id,
                    entityType: 'CoBorrower',
                    activeApplicationIndex,
                    applicationId: key,
                  }),
                  await storeCompany({
                    debtorId: debtor._id,
                    entityType: 'CoBorrower',
                    activeApplicationIndex,
                    applicationId: key,
                  }),
                ]);
              } else if (debtor?.entityType === 'SOLE_TRADER') {
                await storeIndividual({
                  debtorId: debtor._id,
                  entityType: 'CoBorrower',
                  activeApplicationIndex,
                  applicationId: key,
                });
              }

              const approvedApplicationDetails =
                applicationApprovalDetails?.[key]?.[activeApplicationIndex];
              const applicationQuestions =
                questionAnswerList?.[key]?.[activeApplicationIndex];
              const activeApplicationDetails =
                applicationDetails?.[key]?.[activeApplicationIndex];
              const application = new Application({
                applicationId: key,
                clientId: client._id,
                debtorId: debtor._id,
                status: mapApplicationStatus({
                  status:
                    applicationList[key][activeApplicationIndex]['cd_status'],
                }),
                isAutoApproved: false,
                isExtendedPaymentTerms:
                  applicationQuestions?.['extended_policy'] === '1',
                isPassedOverdueAmount:
                  applicationQuestions?.['extended_overdue'] === '1',
                creditLimit: approvedApplicationDetails?.['am_requsted']
                  ? parseInt(approvedApplicationDetails['am_requsted'])
                  : 0,
                acceptedAmount: approvedApplicationDetails?.['am_granted']
                  ? parseInt(approvedApplicationDetails['am_granted'])
                  : 0,
                clientReference:
                  approvedApplicationDetails?.['no_acc_reference'] || '',
                comments: activeApplicationDetails?.['tx_comments'] || '',
                requestDate: approvedApplicationDetails?.['dt_submit']
                  ? moment(
                      approvedApplicationDetails?.['dt_submit'],
                      'DD/MM/YYYY HH:mm:ss a',
                    ).toISOString()
                  : null,
                approvalOrDecliningDate: approvedApplicationDetails?.[
                  'dt_effective'
                ]
                  ? moment(
                      approvedApplicationDetails?.['dt_effective'],
                      'DD/MM/YYYY HH:mm:ss a',
                    ).toISOString()
                  : approvedApplicationDetails?.['dt_approved']
                  ? moment(
                      approvedApplicationDetails?.['dt_approved'],
                      'DD/MM/YYYY HH:mm:ss a',
                    ).toISOString()
                  : null,
                isEndorsedLimit:
                  activeApplicationDetails?.['tx_tcr_product'] ===
                  'Endorsed Limit',
              });
              await createNotes({
                applicationId: application._id,
                activeApplicationIndex,
                applicationNumber: key,
              });
              const inActiveStatus = ['DECLINED', 'CANCELLED', 'WITHDRAWN'];
              const update = {
                clientId: client._id,
                debtorId: debtor._id,
                isActive: !inActiveStatus.includes(application.status),
                isFromOldSystem: true,
                isEndorsedLimit: application.isEndorsedLimit,
                creditLimit: application.acceptedAmount,
                activeApplicationId: application._id,
              };
              const clientDebtor = await createCreditLimit({
                clientId: client._id,
                debtorId: debtor._id,
                update,
              });
              application.clientDebtorId = clientDebtor?._id;
              await application.save();
              if (approvedApplicationDetails?.['dt_review']) {
                await Debtor.updateOne(
                  { _id: debtor._id },
                  {
                    reviewDate: moment(
                      approvedApplicationDetails['dt_review'],
                      'DD/MM/YYYY HH:mm:ss a',
                    ).toISOString(),
                  },
                );
              }
              processedApplicationCount++;
              console.log('Application generated successfully.....', key);
            }
          }
        } else {
          console.log('Application skipped.........');
        }
      }
    }
    console.log('unProcessedApplicationIds', unProcessedApplicationIds);
    fs.writeFileSync(
      'unProcessedApplicationIds.json',
      JSON.stringify(unProcessedApplicationIds),
    );
    console.log(
      'Processed Application Count..............',
      processedApplicationCount,
    );
  } catch (e) {
    console.log('Error occurred in import applications', e);
  }
};

module.exports = {
  storeMerchantCode,
  importApplications,
};