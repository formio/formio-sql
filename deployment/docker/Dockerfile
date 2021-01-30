FROM   node:12.13-alpine
LABEL  Form.io <support@form.io>

# Should be removed when resquel publishes properly
# Legacy build step that comes from installing from github tag
RUN apk add git

COPY . /usr/src/app
WORKDIR /usr/src/app
RUN yarn install

CMD ["yarn", "start"]
