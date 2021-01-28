FROM   node:12.13-alpine
LABEL  Form.io <support@form.io>

COPY . /usr/src/app
WORKDIR /usr/src/app
RUN yarn install

CMD ["yarn", "start"]
