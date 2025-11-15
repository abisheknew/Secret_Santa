function renderInvite({groupName, link}){
  return {
    subject: `You're invited to join ${groupName}`,
    text: `Join ${groupName} using this link: ${link}`,
    html: `<p>Hi!</p><p>Join <strong>${groupName}</strong> using this link: <a href="${link}">${link}</a></p>`
  };
}

function renderAssignment({groupName, giverName, receiverName, wishlist}){
  return {
    subject: `Your Secret Santa assignment for ${groupName}`,
    text: `Hi ${giverName}, you are the Secret Santa for ${receiverName}. Wishlist: ${JSON.stringify(wishlist||[])}.`,
    html: `<p>Hi <strong>${giverName}</strong>,</p><p>You are the Secret Santa for <strong>${receiverName}</strong>.</p><p>Wishlist: <pre>${JSON.stringify(wishlist||[])}</pre></p>`
  };
}

function renderMagicLink({link}){
  return {
    subject: 'Your magic sign-in link',
    text: `Click to sign in: ${link}`,
    html: `<p>Click to sign in: <a href="${link}">${link}</a></p>`
  };
}

module.exports = { renderInvite, renderAssignment, renderMagicLink };
