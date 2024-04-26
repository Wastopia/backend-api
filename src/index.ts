import {
  Canister,
  Err,
  None,
  Ok,
  Opt,
  Principal,
  Record,
  Result,
  StableBTreeMap,
  Variant,
  Vec,
  ic,
  nat64,
  bool,
  query,
  text,
  update,
} from "azle";
import { hashCode } from "hashcode";
import { v4 as uuidv4 } from "uuid";

// Define user and waste item roles.
const USER_ROLES = ["sender", "receiver"];

// Initialize records.
const Owner = Record({
  id: Principal,
  createdAt: nat64,
  updatedAt: nat64,
});

const User = Record({
  id: Principal,
  name: text,
  role: text,
  createdAt: nat64,
  updatedAt: nat64,
});

const Category = Record({
  id: text,
  name: text,
  price: nat64,
  location: text,
  created_at: nat64,
  updated_at: nat64,
});

const Waste = Record({
  id: text,
  category_id: Vec(Category),
  description: text,
  weight: nat64,
  status: bool,
  authoId: text,
  createdAt: nat64,
  updatedAt: nat64,
});

const Payment = Record({
  id: text,
  wasteId: text,
  weight: nat64,
  amount: nat64,
  payment_method: text,
  transaction_id: text,
  paid_at: nat64,
  fees: nat64,
});

const WastePayload = Record({
  description: text,
  weight: nat64,
  status: bool
});

const CategoryPayload = Record({
  name: text,
  price: nat64,
  location: text,
});

// Define error variants with specific messages.
const Error = Variant({
  NotFound: text,
  Unauthorized: text,
  Forbidden: text,
  BadRequest: text,
  InternalError: text,
  UserAlreadyExists: text,
  InvalidUserRole: text,
  UserDoesNotExist: text,
  WasteDoesNotExist: text,
  InactiveUser: text,
  UnauthorizedWasteEdit: text,
  InvalidWasteStatusUpdate: text,
});

// Initialize storages.
const ownerStorage = StableBTreeMap(0, Principal, Owner);
const userStorage = StableBTreeMap(1, Principal, User);
const categoryStorage = StableBTreeMap(2, text, Category);
const wasteStorage = StableBTreeMap(3, text, Waste);
const paymentStorage = StableBTreeMap(4, text, Payment);

function isOwner(caller: Principal): boolean {
  return ownerStorage.containsKey(caller);
}

export default Canister({
  /**
   * Initialize owner.
   * Returns the new owner.
   * Throws error if owner has already been initialized.
   * Throws error if any other error occurs.
   */
  initOwner: update([], Result(Principal, Error), () => {
    if (!ownerStorage.isEmpty()) {
      return Err({ BadRequest: "Owner has already been initialized" });
    }

    try {
      // Create new owner, insert it into storage and return it.
      const newOwner = {
        id: ic.caller(),
        createdAt: ic.time(),
        updatedAt: ic.time(),
      };
      ownerStorage.insert(ic.caller(), newOwner);
      return Ok(ic.caller());
    } catch (error) {
      // If any error occurs, return it.
      return Err({ InternalError: `${error}` });
    }
  }),
  /**
   * Create user.
   * Returns the new user.
   * Throws error if user already exists.
   * Throws error if role is invalid.
   * Throws error if any other error occurs.
   */
  createUser: update([text], Result(User, Error), (name) => {
    let currentPrincipal = ic.caller();

    try {
      // Check if user already exists.
      if (userStorage.containsKey(currentPrincipal)) {
        return Err({ UserAlreadyExists: "You already have an account" });
      }

      // Validate user role.
      if (!USER_ROLES.includes(name)) {
        return Err({ InvalidUserRole: `Invalid role '${name}'. Valid roles are: ${USER_ROLES.join(', ')}` });
      }

      // Create new user, insert it into storage and return it.
      const newUser = {
        id: currentPrincipal,
        name,
        role: name,
        status: true, // Active by default
        createdAt: ic.time(),
        updatedAt: ic.time(),
      };
      userStorage.insert(newUser.id, newUser);
      return Ok(newUser);
    } catch (error) {
      // If any error occurs, return it.
      return Err({ InternalError: `${error}` });
    }
  }),
  /**
   * Get users.
   * Returns the users.
   * Throws error if caller is not the owner.
   * Throws error if any other error occurs.
   */
  getUsers: query([], Result(Vec(User), Error), () => {
    if (!isOwner(ic.caller())) {
      return Err({ Forbidden: "Action reserved for the contract owner" });
    }
    try {
      const users = userStorage.values();
      return Ok(users);
    } catch (error) {
      // If any error occurs, return it.
      return Err({ InternalError: `${error}` });
    }
  }),
  /**
   * Get user.
   * Returns the user.
   * Throws error if user does not exist.
   * Throws error if any other error occurs.
   */
  getMe: query([], Result(User, Error), () => {
    let currentPrincipal = ic.caller();

    try {
      // If user does not exist, return error.
      if (!userStorage.containsKey(currentPrincipal)) {
        return Err({ Unauthorized: "Create an account first" });
      }

      // Return the current user.
      const user = userStorage.get(currentPrincipal);
      return Ok(user.Some);
    } catch (error) {
      // If any error occurs, return it.
      return Err({ InternalError: `${error}` });
    }
  }),

  getActiveWasteById: query([text], Result(Waste, Error), (id) => {
    try {
      const waste = wasteStorage.get(id);
      if (!waste.Some) {
        return Err({ WasteDoesNotExist: "Waste item does not exist" });
      }
      return Ok(waste.Some);
    } catch (error) {
      // If any error occurs, return it.
      return Err({ InternalError: `${error}` });
    }
  }),
  createWaste: update([WastePayload], Result(Waste, Error), (wastepayload) => {
    let currentPrincipal = ic.caller();

    try {
      // If user does not exist, return error.
      if (!userStorage.containsKey(currentPrincipal)) {
        return Err({ Unauthorized: "Create an account first" });
      }

      const user = userStorage.get(currentPrincipal);

      if (!user.Some.status) {
        return Err({ Forbidden: "Account is currently deactived" });
      }

      // Create new waste, insert it into storage and return it.
      const newWaste = {
        id: wastepayload.id,
        categoryId: wastepayload.categoryId,
        description: wastepayload.description,
        weight: wastepayload.weight,
        status: wastepayload.status,
        authorId: currentPrincipal.toText(),
        createdAt: ic.time(),
        updatedAt: ic.time(),
      };
      wasteStorage.insert(newWaste.id, newWaste);
      return Ok(newWaste);
    } catch (error) {
      // If any error occurs, return it.
      return Err({ InternalError: `${error}` });
    }
  }),
  /**
   * Update waste item.
   * Returns the updated waste item.
   * Throws error if waste item does not exist.
   * Throws error if user is unauthorized to edit (author or buyer with verified waste).
   * Throws error if invalid status update is provided.
   * Throws error if any other error occurs.
   */
  updateWaste: update([WastePayload], Result(Waste, Error), (wastepayload) => {
    try {
      if (!wasteStorage.containsKey(wastepayload.id)) {
        return Err({ NotFound: "Waste not found" });
      }

      const waste = wasteStorage.get(wastepayload.id);
      let currentStatus = wastepayload.status;
      let currentSender = waste.Some.senderId;
      let userInfo = userStorage.get(ic.caller()).Some;
      let currentPrincipal = ic.caller();

      if (userInfo.role == "sender") {
        if (currentPrincipal != waste.Some.authorId) {
          return Err({ Forbidden: "You can only edit your own selling item." });
        }
      }

      if (current !== waste.Some.authorId) {
        if (userInfo.role !== "receiver") {
          return Err({ Forbidden: "Only receiver can verify and edit the waste item" });
        }
      }

      if (userInfo.role == "sender") {
        currentStatus = wastepayload.status;
        currentSender = currentPrincipal.toText();
      }

      wasteStorage.insert(waste.Some.id, {
        ...waste.Some,
        categoryId: wastepayload.categoryId, 
        description: wastepayload.description,
        weight: wastepayload.weight,
        status: currentStatus,
        senderId: currentSender,
        updatedAt: ic.time(),
      });
      return Ok(waste.Some);
    } catch (error) {
      // If any error occurs, return it.
      return Err({ InternalError: `${error}` });
    }
  }),

  getActiveWastes: query([], Result(Vec(Waste), Error), () => {
    try {
      // Return all active waste records.
      const wastes = wasteStorage
        .values()
        .filter((waste) => waste.status === "active");
      return Ok(wastes);
    } catch (error) {
      // If any error occurs, return it.
      return Err({ InternalError: `${error}` });
    }
  }),

  getInactiveWastes: query([], Result(Vec(Waste), Error), () => {
    if (userStorage.get(ic.caller()).Some.role !== "buyer") {
      return Err({ Forbidden: "Only buyer can verify and edit your waste items" });
    }

    try {
      // Return all inactive waste records.
      const wastes = wasteStorage
        .values()
        .filter((waste) => waste.status === "inactive");
      return Ok(wastes);
    } catch (error) {
      // If any error occurs, return it.
      return Err({ InternalError: `${error}` });
    }
  }),
  /**
   * Get all categories.
   * Returns all categories.
   * Throws error if any other error occurs.
   */
  getAllCategories: query([], Result(Vec(Category), Error), () => {
    try {
      const categories = categoryStorage.values();
      return Ok(categories);
    } catch (error) {
      // If any error occurs, return it.
      return Err({ InternalError: `${error}` });
    }
  }),
  /**
   * Create a new category.
   * Returns the new category.
   * Throws error if any other error occurs.
   * Only owner can create a new category.
   */
  createCategory: update([CategoryPayload], Result(Category, Error), (name) => {
    if (!isOwner(ic.caller())) {
      return Err({ Forbidden: "Action reserved for new waste category" });
    }

    try {
      const newCategory = {
        id: uuidv4(),
        name,
      };
      categoryStorage.insert(newCategory.id, newCategory);
      return Ok(newCategory);
    } catch (error) {
      // If any error occurs, return it.
      return Err({ InternalError: `${error}` });
    }
  }),
 
  /**
   * Create waste item.
   * Returns the new waste item.
   * Throws error if user does not exist.
   * Throws error if user is inactive.
   * Throws error if any other error occurs.
   */
  
   /**
   * Get active articles by category.
   * Returns all articles.
   * Throws error if any other error occurs.
   */
   getActiveWasteByCategory: query(
    [text],
    Result(Vec(Waste), Error),
    (categoryId) => {
      try {
        const waste = wasteStorage
          .values()
          .filter(
            (waste) => waste.categoryId === categoryId && waste.status
          );
        return Ok(waste);
      } catch (error) {
        // If any error occurs, return it.
        return Err({ InternalError: `${error}` });
      }
    }
  ),

    /**
   * Process payment for a waste item.
   * Returns the payment details.
   * Throws error if waste item does not exist or is not active.
   * Throws error if user does not have the 'buyer' role.
   * Throws error if any other error occurs.
   */
    processPayment: update(
      [text, nat64, text],
      Result(Payment, Error),
      (wasteId, amount, paymentMethod) => {
        let currentPrincipal = ic.caller();
    
        try {
          // Check if the waste item exists and is active
          const waste = wasteStorage.get(wasteId);
          if (waste == None || waste.Some.status !== "active") {
            return Err({ BadRequest: "Invalid waste item" });
          }
    
          // Check if the user has the 'buyer' role
          const user = userStorage.get(currentPrincipal);
          if (user == None || user.Some.role !== "buyer") {
            return Err({ Unauthorized: "Only buyers can process payments" });
          }
    
             // Convert amount (nat64) to a number
          const amountAsNumber = Number(amount);

          // Calculate fees (5% of the payment amount)
          const feesAsNumber = amountAsNumber * 0.05;

          // Convert the result back to nat64
          const fees = nat64.fromNumber(feesAsNumber);
    
          // Create a new payment record
          const newPayment = {
            id: uuidv4(),
            waste_id: wasteId,
            weight: waste.Some.weight,
            amount,
            payment_method: paymentMethod,
            transaction_id: `TX_${uuidv4()}`, // Generate a unique transaction ID
            paid_at: ic.time(),
            fees,
          };
    
          // Insert the payment into storage
          paymentStorage.insert(newPayment.id, newPayment);
    
          return Ok(newPayment);
        } catch (error) {
          // If any error occurs, return it.
          return Err({ InternalError: `${error}` });
        }
      }
    ),
  });
          /*
    a hash function that is used to gene/*
    a hash function that is used to generate correlation ids for orders.
    also, we use that in the verifyPayment function where we check if the used has actually paid the order
*/
function hash(input: any): nat64 {
  return BigInt(Math.abs(hashCode().value(input)));
};  
    
    // a workaround to make uuid package work with Azle
    globalThis.crypto = {
      // @ts-ignore
      getRandomValues: () => {
        let array = new Uint8Array(32);
        for (let i = 0; i < array.length; i++) {
          array[i] = Math.floor(Math.random() * 256);
        }
        
        return array;
      },
    };
    function generateCorrelationId(productId: text): nat64 {
      const correlationId = `${productId}_${ic.caller().toText()}_${ic.time()}`;
      return hash(correlationId);
  };
  
  /*
      after the order is created, we give the `delay` amount of minutes to pay for the order.
      if it's not paid during this timeframe, the order is automatically removed from the pending orders.
  */
  function discardByTimeout(memo: nat64, delay: Duration) {
      ic.setTimer(delay, () => {
          const order = pendingOrders.remove(memo);
          console.log(`Order discarded ${order}`);
      });
  };
  async function verifyPaymentInternal(receiver: Principal, amount: nat64, block: nat64, memo: nat64): Promise<bool> {
      const blockData = await ic.call(icpCanister.query_blocks, { args: [{ start: block, length: 1n }] });
      const tx = blockData.blocks.find((block) => {
          if ("None" in block.transaction.operation) {
              return false;
          }
          const operation = block.transaction.operation.Some;
          const senderAddress = binaryAddressFromPrincipal(ic.caller(), 0);
          const receiverAddress = binaryAddressFromPrincipal(receiver, 0);
          return block.transaction.memo === memo &&
              hash(senderAddress) === hash(operation.Transfer?.from) &&
              hash(receiverAddress) === hash(operation.Transfer?.to) &&
              amount === operation.Transfer?.amount.e8s;
      });
      return tx ? true : false;
  };
    
      