import { CloneInputType } from '../types/input';
import { CloneType } from '../types';
import { Clone } from '../../models';
import { CloneModeEnum } from '../../enums/CloneMode';
import { BotTypesEnum } from '../../enums/BotTypes';
import teams_FbByTeamMember from '../../graphQLCalls/teams_FbByTeamMember';
import cloneDetails from '../cloneDetails'

import {
  AuthentificationError,
  WrongArgumentsError,
  OperationsError
} from '../../errors'

import logger from '../../config/logger'
import createKubernetesClone from '../../kubernetes/createClone'
import { isDefined, getSelectedBot } from '../../config/utils'

const args = {
  clone: {type: CloneInputType }
}

const resolve = async(parent, { clone }, context) => {
  logger.debug('addClone -> Entering Fuction.')

  if (!context.userId) {
    throw new AuthentificationError()
  }

  if(!Object.values(CloneModeEnum).includes(clone.mode)){
    throw new WrongArgumentsError('The mode selected is not valid.')
  }

  if(!Object.values(BotTypesEnum).includes(clone.botType)){
    throw new WrongArgumentsError('The bot type selected is not valid.')
  }

  let existingClone = await Clone.find(
    {
      authId: context.userId,
      mode: clone.mode,
      botId: clone.botId,
      active: true
    })

  logger.debug('addClone -> Checking existing clone %j', existingClone)
  if(existingClone.length > 0){
    throw new OperationsError('You can only have one active clone by mode. Remove the'
      + ' existing clone of type: ' + clone.mode + ' and try again.')
  }

  try{
    // Authorization is handled by the teams module
    let botsByUser = await teams_FbByTeamMember(context.authorization)
    clone = await cloneDetails(context.authorization, botsByUser, clone)
    let selectedBot = getSelectedBot(botsByUser.data.data.teams_FbByTeamMember, clone.botId)
    clone.createDatetime = new Date().valueOf() / 1000|0
    clone.active = true

    logger.debug('addClone -> Creating a new clone.')
    let newClone = new Clone(clone)
    newClone.authId = context.userId
    clone.id = newClone._id
    await createKubernetesClone(clone)

    return new Promise((resolve, reject) => {
      newClone.save((err) => {
        if (err){
          logger.debug('addClone -> Error: %j', err)
          reject('There has been an error storing the clone.')
        }
        else {
          //TODO transaction on database
          logger.debug('addClone -> Save clone sucessful.')
          resolve(newClone)
        }
      })
    })
  } catch(err) {
    logger.error('addClone -> Error: %s', err.stack)
    throw new OperationsError('There has been an error creating the clone.')
  }
}

const mutation = {
  addClone: {
    type: CloneType,
    args,
    resolve
  }
}

export default mutation
