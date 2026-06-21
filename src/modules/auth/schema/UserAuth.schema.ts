import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema()
class HubspotTokenConfig {
  @Prop({ type: String, default: null })
  accessToken!: string | null;

  @Prop({ type: String, default: null })
  refreshToken!: string | null;

  @Prop({ type: Number, default: null })
  expiresAt!: number | null;
}

const HubspotTokenConfigSchema =
  SchemaFactory.createForClass(HubspotTokenConfig);

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, type: String, unique: true })
  email!: string;

  @Prop({ required: true, type: String })
  password!: string;

  @Prop({ type: String, default: null })
  refreshToken?: string | null;

  @Prop({ type: HubspotTokenConfigSchema, default: () => ({}) })
  hubspot?: HubspotTokenConfig;
}

export const UserSchema = SchemaFactory.createForClass(User);
