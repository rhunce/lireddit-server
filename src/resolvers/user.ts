import { MyContext } from '../types';
import { Resolver, Ctx, Arg, Mutation, InputType, Field, ObjectType, Query } from 'type-graphql';
import { User } from '../entities/User';
import argon2 from 'argon2';

@InputType()
class UsernamePasswordInput {
  @Field()
  username: string
  @Field()
  password: string
}

@ObjectType()
class FieldError {
  @Field()
  field?: string;

  @Field()
  message?: string;
}

@ObjectType()
class UserResponse {
  @Field(() => [FieldError], { nullable: true })
  errors?: FieldError[];

  @Field(() => User, { nullable: true })
  user?: User;
}

@Resolver()
export class UserResolver {
  @Query(() => User, { nullable: true })
  async me(@Ctx() { req, em }: MyContext) {
    // you are not logged in
    if (!req.session.userId) {
      return null;
    }
    const user = await em.findOneOrFail(User, { id: req.session.userId });
    return user;
  }

  @Mutation(() => UserResponse)
  async register(
    @Arg("options")
    options: UsernamePasswordInput,
    @Ctx()
    { em, req }: MyContext
  ): Promise<UserResponse> {
    if (options.username.length <= 2) {
      return {
        errors: [{ field: "username", message: "Length must be greater than 2." }]
      };
    }
    if (options.password.length <= 3) {
      return {
        errors: [{ field: "password", message: "Length must be greater than 3." }]
      };
    }
    const hashedPassword = await argon2.hash(options.password);
    const user = em.create(User, {
      username: options.username,
      password: hashedPassword
    });

    try {
      await em.persistAndFlush(user);
    } catch (err) {
      // duplicate username error
      if (err.code = "23505") {
        return {
          errors: [{ field: "username", message: "Username already taken." }]
        }
      }
    }
    return { user };
  }

  @Mutation(() => UserResponse)
  async login(
    @Arg("options")
    options: UsernamePasswordInput,
    @Ctx()
    { em, req }: MyContext
  ): Promise<UserResponse> {
    const user = await em.findOneOrFail(User, { username: options.username });
    if (!user) {
      return {
        errors: [{ field: "username", message: "Username doesn't exist." }]
      };
    }
    const valid = await argon2.verify(user.password, options.password);
    if (!valid) {
      return {
        errors: [{ field: "password", message: "Incorrect password." }]
      };
    }

    // store user id session
    // this will set a cookie on the user
    // keep them logged in
    req.session!.userId = user.id;

    return { user };
  }

}