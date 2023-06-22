const express = require('express');
require('dotenv').config()
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

// verify jwt token middleware here
const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'unauthorized access' });
    }
    // bearer token
    const token = authorization.split(" ")[1];

    jwt.verify(token, process.env.ACCESS_TOKEN, (error, decoded) => {
        if (error) {
            return res.status(401).send({ error: true, message: 'forbidden access' })
        }
        req.decoded = decoded;
        next();
    })
}



const uri = `mongodb+srv://${process.env.USER_NAME}:${process.env.USER_PASSWORD}@cluster0.oz0lbz6.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

const dbConnect = async () => {
    try {
        client.connect();
        console.log("Database Connected Successfully✅");

    } catch (error) {
        console.log(error.name, error.message);
    }
}
dbConnect()

const usersCollection = client.db("athleticAcademy").collection("users");
const classCollection = client.db("athleticAcademy").collection("allClass");


// JWT TOKEN SIGN HERE
app.post('/jwt', (req, res) => {
    const user = req.body;
    const token = jwt.sign(user, process.env.ACCESS_TOKEN, { expiresIn: '1h' })
    res.send({ token })
})

// VERIFY ADMIN MIDDLEWARE HERE
const verifyAdmin = async (req, res, next) => {
    const email = req.decoded.email;
    const query = { email: email }
    const user = await usersCollection.findOne(query);
    if (user?.role !== 'admin') {
        return res.status(403).send({ error: true, message: 'forbidden message' });
    }
    next();
}

// users related apis
app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
    const result = await usersCollection.find().toArray();
    res.send(result);
});

app.get('/singleUser/:email', verifyJWT, async (req, res) => {
    const reqEmail = req.params.email;
    const result = await usersCollection.findOne({ email: reqEmail })
    res.send(result)
})

app.post('/users', async (req, res) => {
    const user = req.body;
    user.role = "student"
    const query = { email: user.email }
    const existingUser = await usersCollection.findOne(query);

    if (existingUser) {
        return res.send({ message: 'User is already exists' })
    }

    const result = await usersCollection.insertOne(user);
    res.send(result);
});
// check user is student or not
app.get('/users/student/:email', verifyJWT, async (req, res) => {
    const email = req.params.email;

    if (req.decoded.email !== email) {
        res.send({ student: false })
    }
    const query = { email: email }
    const user = await usersCollection.findOne(query);
    const result = { student: user?.role === 'student' }
    res.send(result);
})
// check user is instructor or not
app.get('/users/instructor/:email', verifyJWT, async (req, res) => {
    const email = req.params.email;

    if (req.decoded.email !== email) {
        res.send({ instructor: false })
    }
    const query = { email: email }
    const user = await usersCollection.findOne(query);
    const result = { instructor: user?.role === 'instructor' }
    res.send(result);
})
// check user is admin or not
app.get('/users/admin/:email', verifyJWT, async (req, res) => {
    const email = req.params.email;

    if (req.decoded.email !== email) {
        res.send({ admin: false })
    }
    const query = { email: email }
    const user = await usersCollection.findOne(query);
    const result = { admin: user?.role === 'admin' }
    res.send(result);
})

// make user student to admin
app.patch('/users/admin/:id', verifyJWT, verifyAdmin, async (req, res) => {
    const id = req.params.id;
    const filter = { _id: new ObjectId(id) };
    const updateDoc = {
        $set: {
            role: 'admin'
        },
    };

    const result = await usersCollection.updateOne(filter, updateDoc);
    res.send(result);
})
// make user student to instructor
app.patch('/users/instructor/:id', verifyJWT, verifyAdmin, async (req, res) => {
    const id = req.params.id;
    const filter = { _id: new ObjectId(id) };
    const updateDoc = {
        $set: {
            role: 'instructor'
        },
    };

    const result = await usersCollection.updateOne(filter, updateDoc);
    res.send(result);
})

// add class api created here
app.post('/allClass', async (req, res) => {
    const addClassData = req.body;
    const result = await classCollection.insertOne(addClassData);
    res.send(result);
})
// see all classes by admin related apis
app.get('/allClasses', verifyJWT, verifyAdmin, async (req, res) => {
    const result = await classCollection.find().toArray();
    res.send(result);
});
// class update by instructor
app.patch('/updateClass/:id', verifyJWT, async (req, res) => {
    const id = req.params.id;
    const { seats, price, className } = req.body.data;

    const filter = { _id: new ObjectId(id) }
    const updateClassDoc = {
        $set: {
            className: className,
            price: price,
            seats: seats
        }
    }
    const result = await classCollection.updateOne(filter, updateClassDoc)
    res.send(result);
})
// see popular classes see by all
app.get('/popularClasses', async (req, res) => {
    const result = await classCollection.find({ status: 'approve' }).sort({ students: -1 }).limit(6).toArray();
    res.send(result);
});
// see popular instructors see by all
app.get('/popularInstructor', async (req, res) => {

    // Retrieve instructor data
    const instructors = await usersCollection.find({ role: 'instructor' }).toArray();
    // Prepare response
    const result = [];

    for (const instructor of instructors) {

        // Retrieve courses taught by the instructor with status "approve"
        const courses = await classCollection.find({ instructorEmail: instructor.email, status: 'approve' }).toArray();

        // Calculate the sum of students for all courses
        const totalStudents = courses.reduce((sum, course) => sum + course.students, 0);

        // Extract course names from the courses array
        const courseNames = courses.map((course) => course.className);

        // Create an object with the required data
        const instructorData = {
            name: instructor.name,
            imgURL: instructor.imgURL,
            totalStudents,
            courseNames,
        };
        // Add the instructor data to the result array
        result.push(instructorData);
    }
    // Sort the result array in descending order by totalStudents
    result.sort((a, b) => b.totalStudents - a.totalStudents);
    const topSixData = result.slice(0, 6);
    res.send(topSixData)
});


// handle approve by admin
app.patch('/allClasses/admin/approve/:id', verifyJWT, verifyAdmin, async (req, res) => {
    const id = req.params.id;
    const filter = { _id: new ObjectId(id) };
    const updateDoc = {
        $set: {
            status: 'approve'
        },
    };

    const result = await classCollection.updateOne(filter, updateDoc);
    res.send(result);
})
// handle deny by admin
app.patch('/allClasses/admin/deny/:id', verifyJWT, verifyAdmin, async (req, res) => {
    const id = req.params.id;
    const filter = { _id: new ObjectId(id) };
    const updateDoc = {
        $set: {
            status: 'deny'
        },
    };

    const result = await classCollection.updateOne(filter, updateDoc);
    res.send(result);
})

// handle feedback by admin
app.put('/allClasses/admin/feedback/:id', verifyJWT, verifyAdmin, async (req, res) => {
    const id = req.params.id;
    const data = req.body.body;
    const filter = { _id: new ObjectId(id) };
    const updateDoc = {
        $set: {
            feedback: data
        },
    };
    const options = { upsert: true };

    const result = await classCollection.updateOne(filter, updateDoc, options);
    res.send(result);
})

// see all class api here
app.get('/allClass', verifyJWT, async (req, res) => {
    const email = req.query.email;

    if (!email) {
        res.send([]);
    }

    const decodedEmail = req.decoded.email;
    if (email !== decodedEmail) {
        return res.status(403).send({ error: true, message: 'forbidden access' })
    }

    const query = { instructorEmail: email };
    const result = await classCollection.find(query).toArray();
    res.send(result);
});

// select classes by students
app.put('/selectClass/:email', verifyJWT, async (req, res) => {
    try {
        const reqEmail = req.params.email;
        const selectId = req.body.id;
        const options = { upsert: true };
        const filter = { email: reqEmail };
        const updateDoc = {
            $addToSet: {
                selectedClasses: selectId
            }
        };

        const result = await usersCollection.updateOne(filter, updateDoc, options);
        res.send(result);
    } catch (error) {
        console.error('Error occurred while updating the document:', error);
        res.status(500).send('Internal Server Error');
    }
});

// selected class get api here
app.get('/SelectedClasses/:email', verifyJWT, async (req, res) => {
    try {
        const reqEmail = req.params.email;

        const filter = { email: reqEmail };
        const user = await usersCollection.findOne(filter);
        const selectedClassIds = user.selectedClasses?.map(id => new ObjectId(id));

        const classes = await classCollection.find({ _id: { $in: selectedClassIds } }).toArray();

        res.send(classes);
    } catch (error) {
        console.error('Error occurred while retrieving the classes:', error);
        res.status(500).send('Internal Server Error');
    }
});
// selected class get api here
app.get('/enrolledClasses/:email', verifyJWT, async (req, res) => {
    try {
        const reqEmail = req.params.email;

        const filter = { email: reqEmail };
        const user = await usersCollection.findOne(filter);
        const enrolledClasses = user.enrolledClasses;

        // Sort the enrolledClasses array by date in descending order
        enrolledClasses.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.send(enrolledClasses);
    } catch (error) {
        console.error('Error occurred while retrieving the classes:', error);
        res.status(500).send('Internal Server Error');
    }
});

// selected class remove api created here
app.put('/removeSelectedClass/:email', verifyJWT, async (req, res) => {
    try {
        const reqEmail = req.params.email;
        const selectId = req.body.id

        const filter = { email: reqEmail };
        const updateDoc = {
            $pull: {
                selectedClasses: selectId
            }
        };

        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
    } catch (error) {
        console.error('Error occurred while removing the ID from the array:', error);
        res.status(500).send('Internal Server Error');
    }
});

// all courses or classes data here
app.get('/allApprovedCourses', async (req, res) => {
    const result = await classCollection.find({ status: "approve" }).sort({ students: -1 }).toArray();
    res.send(result);
})
// all allInstructors data here
app.get('/allInstructors', async (req, res) => {
    // Retrieve instructor data
    const instructors = await usersCollection.find({ role: 'instructor' }).toArray();
    // Prepare response
    const result = [];

    for (const instructor of instructors) {

        // Retrieve courses taught by the instructor with status "approve"
        const courses = await classCollection.find({ instructorEmail: instructor.email, status: 'approve' }).toArray();

        // Calculate the sum of students for all courses
        const totalStudents = courses.reduce((sum, course) => sum + course.students, 0);

        // Extract course names from the courses array
        const courseNames = courses.map((course) => course.className);
        const popularCourses = courseNames.slice(0, 3);

        // Create an object with the required data
        const instructorData = {
            email: instructor.email,
            name: instructor.name,
            imgURL: instructor.imgURL,
            totalStudents,
            popularCourses,
        };
        // Add the instructor data to the result array
        result.push(instructorData);
    }
    // Sort the result array in descending order by totalStudents
    result.sort((a, b) => b.totalStudents - a.totalStudents);
    res.send(result)

    // const result = await usersCollection.find({ role: 'instructor' }).toArray();
    // res.send(result);
})


// payment section api started here
// create payment intent
app.post('/create-payment-intent', verifyJWT, async (req, res) => {
    const { price } = req.body;
    const amount = parseInt(price * 100);
    const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
    });

    res.send({
        clientSecret: paymentIntent.client_secret
    })
})

// make payment here
app.post('/payments', verifyJWT, async (req, res) => {
    try {
        const reqEmail = req.body.email;
        const reqId = req.body.id;

        // firstly find the class
        const classFilter = { _id: new ObjectId(reqId) }
        const classResult = await classCollection.findOne(classFilter);

        const enrolledClassData = {
            classId: reqId,
            imgURL: classResult?.imgURL,
            className: classResult?.className,
            instructorName: classResult?.instructorName,
            date: req.body?.date,
            transactionId: req.body?.transactionId,
            price: classResult?.price
        }
        const userFilter = { email: reqEmail };
        const options = { upsert: true };
        const pushUpdateDoc = {
            $addToSet: {
                enrolledClasses: enrolledClassData
            }
        };
        const pullUpdateDoc = {
            $pull: {
                selectedClasses: enrolledClassData.classId
            }
        };

        const classUpdateDoc = {
            $inc: {
                students: 1,
                seats: -1
            }
        };

        try {
            await usersCollection.updateOne(userFilter, pushUpdateDoc, options);
            await usersCollection.updateOne(userFilter, pullUpdateDoc);
            await classCollection.updateOne(classFilter, classUpdateDoc)

            res.send('successful');
        } catch (error) {
            throw error;
        }


    } catch (error) {
        console.error('Error occurred while enrolling in the class:', error);
        res.status(500).send('Internal Server Error');
    }
})




app.get('/', (req, res) => {
    res.send('athletic-academy is running')
})

app.listen(port, () => {
    console.log(`athletic-academy is running on port ${port}`);
})
