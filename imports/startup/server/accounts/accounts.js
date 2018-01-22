import { Meteor } from 'meteor/meteor';
import { _ } from 'meteor/underscore';
import { Accounts } from 'meteor/accounts-base';

import { convertToSlug } from '/lib/utils';
import { deburr, toLower, camelCase } from 'lodash';

function generateAvailableUsername(newUsername) {
  let i = 0;
  while (Meteor.call('verifyUsername', newUsername, (err, id) => {
    if (id) {
      return false;
    }
    return true;
  })) {
    i += 1;
    newUsername += i;
  }
  return newUsername;
}

function normalizeFacebookUser(profile, user) {
  const credential = profile.credentials || [];
  credential.push({
    source: 'facebook',
    URL: user.services.facebook.link,
    validated: true,
  });

  const userProfile = _.extend(profile, {
    picture: `https://graph.facebook.com/${user.services.facebook.id}/picture/?type=large`,
    firstName: user.services.facebook.first_name,
    lastName: user.services.facebook.last_name,
    credentials: credential,
  });

  let username = user.username;
  if (!username) {
    // No username is defined coming from Facebook login
    let newUsername = convertToSlug(userProfile.firstName) + convertToSlug(userProfile.lastName);
    username = generateAvailableUsername(newUsername);
  }

  return _.extend(user, {
    username,
    profile: userProfile,
  });
}

function normalizeTwitterUser(profile, user) {
  const credential = profile.credentials || [];
  credential.push({
    source: 'twitter',
    URL: `http://twitter.com/${user.services.twitter.screenName}`,
    validated: true,
  });

  const userProfile = _.extend(profile, {
    picture: user.services.twitter.profile_image_url,
    firstName: user.services.twitter.screenName,
    credentials: credential,
  });

  return _.extend(user, {
    profile: userProfile,
  });
}

function normalizeBlockstackUser(profile, user) {
  const credential = profile.credentials || [];

  credential.push({
    source: 'blockstack',
    URL: user.services.blockstack.token.payload.profile_url,
    validated: true,
  });

  const { name } = user.services.blockstack.userData.profile;
  profile = _.extend(profile, {
    firstName: name,
    credentials: credential,
  });
  
  if (user.services.blockstack.userData.profile.image && 
      user.services.blockstack.userData.profile.image.length > 0 && 
      user.services.blockstack.userData.profile.image[0].contentUrl) {
    profile.picture = user.services.blockstack.userData.profile.image[0].contentUrl;
  }

  const username = user.services.blockstack.token.payload.username || generateAvailableUsername(deburr(toLower(camelCase(name))));

  return _.extend(user, {
    username,
    profile,
  });
}

function normalizeCivicUser(profile, user) {
  const credential = profile.credentials || [];

  credential.push({
      source: 'civic',
      URL: undefined, // there is no civic user profile URL
      validated: user.services.civic.userData.data[0].isValid,
  });
  // right now civic only passes user email
  const username = generateAvailableUsername(user.services.civic.userData.data.label['contact.personal.email'].value);

  return _.extend(user, {
    username,
    });
}

const normalizers = {
  facebook: normalizeFacebookUser,
  twitter: normalizeTwitterUser,
  blockstack: normalizeBlockstackUser,
  civic: normalizeCivicUser
};

/**
* at user creation the following specifications must be met
****/
Accounts.onCreateUser((opts, user) => {
  const profile = opts.profile || {};
  
  // Find the first normalizer for the first service the user has.
  // Not sure if we need to be so strict, but I'm keeping the contract of the previous impl.
  const normalizer = _.chain(normalizers)
    .pick(Object.keys(user.services || {}))
    .values()
    .first()
    .value();

  user = !!normalizer ? normalizer(profile, user) : user;
  
  return user;
});
