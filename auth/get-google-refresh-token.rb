#gem install 'google-api-client'

require 'google/api_client'

#Setup auth client
client_secrets = Google::APIClient::ClientSecrets.load #client_secrets.json must be present in current directory!
auth_client = client_secrets.to_authorization
auth_client.update!(
  :scope => ['https://spreadsheets.google.com/feeds', 'https://www.googleapis.com/auth/drive'],
  :access_type => "offline", #will make refresh_token available
  :approval_prompt =>'force'
)

refresh_token_available = File.exist?('refresh_token.txt')

if !refresh_token_available
 #OAuth URL - this is the url that will prompt a Google Account owner to give access to this app.
 puts "Navigate browser to: '#{auth_client.authorization_uri.to_s}' and copy/paste auth code after redirect."

 #Once the authorization_uri (above) is followed and authorization is given, a redirect will be made
 #to http://www.myauthorizedredirecturl.com (defined above) and include the auth code in the request url.
 print "Auth code: "
 auth_client.code = gets
else
 #If authorization has already been given and refresh token saved previously, simply set the refresh code here.
 auth_client.refresh_token = File.read('refresh_token.txt')
end

#Now, get our access token which is what we will need to work with the API.
auth_client.fetch_access_token!

if !refresh_token_available
 #Save refresh_token for next time
 #Note: auth_client.refresh_token is only available the first time after OAuth permission is granted.
 #If you need it again, the Google Account owner would have deauthorize your app and you would have to request access again.
 #Therefore, it is important that the refresh token is saved after authenticating the first time!
 File.open('refresh_token.txt', 'w') { |file| file.write(auth_client.refresh_token) }
 File.open('access_token.txt', 'w') { |file| file.write(auth_client.access_token) }
 print "New Refresh Token: #{auth_client.refresh_token}"
 print "New Access Token: #{auth_client.access_token}"
 refresh_token_available = true
end
