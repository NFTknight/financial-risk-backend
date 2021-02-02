/*
* Module Imports
* */
const jwt = require('jsonwebtoken');
const axios = require('axios');
const mongoose = require('mongoose');
const Organization = mongoose.model('organization');

/*
* Local Imports
* */
const config = require('../config');
const Logger = require('../services/logger');

let getClients = ({searchKeyword}) => {
    return new Promise(async (resolve, reject) => {
        try {
            let url = 'https://apiv4.reallysimplesystems.com/accounts';
            let query = {
                "name": {
                    "$con": searchKeyword
                },
                "type": "Client"
            };
            let organization = await Organization.findOne({isDeleted: false}).select({'integration.rss': 1});
            // console.log('ORG::', organization);
            let options = {
                method: 'GET',
                url: url,
                headers: {
                    Authorization: 'Bearer ' + organization.integration.rss.accessToken,
                },
                params: {
                    q: query,
                    limit: 100
                }
            };
            // console.log('options::', JSON.stringify(options, null, 2));
            let {data} = await axios(options);
            let clients = data.list.map(client => client.record);
            // console.log('DATA::', JSON.stringify(clients, null, 3));
            Logger.log.info("Successfully retrieved clients from RSS");
            return resolve(clients);
        } catch (err) {
            Logger.log.error("Error in getting clients from RSS");
            Logger.log.error(err.message || err);
            return reject(err);
        }
    });
};

let getInsurers = ({searchKeyword}) => {
    return new Promise(async (resolve, reject) => {
        try {
            let url = 'https://apiv4.reallysimplesystems.com/accounts';
            let query = {
                "name": {
                    "$con": searchKeyword
                },
                "type": "Underwriter"
            };
            let organization = await Organization.findOne({isDeleted: false}).select({'integration.rss': 1});
            // console.log('ORG::', organization);
            let options = {
                method: 'GET',
                url: url,
                headers: {
                    Authorization: 'Bearer ' + organization.integration.rss.accessToken,
                },
                params: {
                    q: query,
                    limit: 100
                }
            };
            // console.log('options::', JSON.stringify(options, null, 2));
            let {data} = await axios(options);
            let insurers = data.list.map(insurer => insurer.record);
            console.log('DATA::', JSON.stringify(insurers, null, 3));
            Logger.log.info("Successfully retrieved insurers from RSS");
            return resolve(insurers);
        } catch (err) {
            Logger.log.error("Error in getting insurers from RSS");
            Logger.log.error(err.message || err);
            return reject(err);
        }
    });
};

let getClientById = ({clientId}) => {
    return new Promise(async (resolve, reject) => {
        try {
            let url = 'https://apiv4.reallysimplesystems.com/accounts/' + clientId;
            let organization = await Organization.findOne({isDeleted: false}).select({'integration.rss': 1});
            let options = {
                method: 'GET',
                url: url,
                headers: {
                    Authorization: 'Bearer ' + organization.integration.rss.accessToken,
                },
            };
            let {data} = await axios(options);
            let client = {
                crmClientId: data.record['id'],
                name: data.record['name'],
                address: {
                    addressLine: data.record['addressline'],
                    city: data.record['addresscity'],
                    state: data.record['addresscounty/state'],
                    country: data.record['addresscountry'],
                    zipCode: data.record['addresspostcode/zip'],
                },
                crmNote: data.record['notes'],
                contactNumber: data.record['phone'],
                website: data.record['website'],
                abn: data.record['abn'],
                acn: data.record['acn'],
                sector: data.record['sector'],
                salesPerson: data.record['salesperson'],
            };
            console.log('client::', JSON.stringify(client, null, 2));
            Logger.log.info("Successfully retrieved client from RSS");
            return resolve(client);
        } catch (err) {
            Logger.log.error("Error in getting client from RSS");
            Logger.log.error(err.message || err);
            return reject(err);
        }
    });
};

let getInsurerById = ({insurerId}) => {
    return new Promise(async (resolve, reject) => {
        try {
            let url = 'https://apiv4.reallysimplesystems.com/accounts/' + insurerId;
            let organization = await Organization.findOne({isDeleted: false}).select({'integration.rss': 1});
            let options = {
                method: 'GET',
                url: url,
                headers: {
                    Authorization: 'Bearer ' + organization.integration.rss.accessToken,
                },
            };
            // console.log('options::', JSON.stringify(options, null, 2));
            let {data} = await axios(options);
            let insurer = data.record;
            console.log('insurer::', JSON.stringify(insurer, null, 2));
            Logger.log.info("Successfully retrieved insurer from RSS");
            return resolve(insurer);
        } catch (err) {
            Logger.log.error("Error in getting insurer from RSS");
            Logger.log.error(err.message || err);
            return reject(err);
        }
    });
};

let getClientContacts = ({clientId}) => {
    return new Promise(async (resolve, reject) => {
        try {
            let url = 'https://apiv4.reallysimplesystems.com/accounts/' + clientId + '/contacts';
            let organization = await Organization.findOne({isDeleted: false}).select({'integration.rss': 1});
            let options = {
                method: 'GET',
                url: url,
                headers: {
                    Authorization: 'Bearer ' + organization.integration.rss.accessToken,
                },
            };
            let {data} = await axios(options);
            let contacts = [];
            data.list.forEach(crmContact => {
                let contact = {
                    firstName: crmContact.record['first'],
                    lastName: crmContact.record['last'],
                    jobTitle: crmContact.record['jobtitle'],
                    crmContactId: crmContact.record['id'],
                    email: crmContact.record['email'],
                    contactNumber: crmContact.record['phone'] ? crmContact.record['phone']: (crmContact.record['mobile'] ? crmContact.record['mobile'] :crmContact.record['direct'] ),
                    department: crmContact.record['department'],
                    hasLeftCompany: crmContact.record['leftcompany'],
                    isDecisionMaker: crmContact.record['decisionmaker'],
                };
                contacts.push(contact);
            });
            Logger.log.info("Successfully retrieved contacts from RSS");
            return resolve(contacts);
        } catch (err) {
            Logger.log.error("Error in getting contacts from RSS");
            Logger.log.error(err.message || err);
            return reject(err);
        }
    });
};

// getClientContacts({clientId: 9});

module.exports = {
    getClients, getInsurers, getClientById, getInsurerById, getClientContacts
};